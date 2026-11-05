// Beauty Scan — Gemini calls through the Remote Service Gateway.
//   1. readProduct(jpegB64): multimodal — reads barcode digits (+ where the barcode is), brand, name
//      and the visible ingredient list from one camera frame. Strict JSON.
//   2. readBarcodeOnly(jpegB64): barcode-only pass, used on a cropped + contrast-boosted close-up.
//   3. findIngredientsOnWeb(...): Google-Search-grounded lookup of the REAL ingredient list when
//      neither Open Beauty Facts nor the package gives one. Accepted only with grounding sources.
//   4. explainForSensitiveSkin(...): only the explanation texts. The SCORE is never asked to the AI:
//      it comes from fixed rules (BeautyScanRules.ts), so the same product always scores the same.
// Each call tries gemini-2.5-flash, then gemini-2.0-flash, with a hard timeout. Nothing here is
// hard-coded product data: if the model fails, the caller shows "Sin conexión".

// Spectacles (2024) / Lens Studio 5.15 port: the 5.15-era Remote Service Gateway ships
// HostedExternal/Gemini (no GoogleGenAI wrapper), so import Gemini directly and keep the request
// types local — the request shape (model / type / body) is the same in every RSG version.
import {Gemini} from "RemoteServiceGateway.lspkg/HostedExternal/Gemini"

type Part = {text?: string; inlineData?: {mimeType: string; data: string}}

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"]

export interface ProductReading {
  found: boolean // a cosmetic / personal-care product is visible
  barcode: string // digits only, "" if not legible
  brand: string
  name: string
  nameEn: string // the product name in English (for database searches), "" if unknown
  ingredients: string // visible INCI list, "" if not legible
  barcodeBox: number[] | null // [ymin, xmin, ymax, xmax] 0–1000 from the image top-left, null if none
}

export type ProblemTag = "heavy_metal" | "allergen" | "irritant" | "endocrine_disruptor"
export type RiskLevel = "high" | "medium" | "low"

export interface ProblemIngredient {
  name: string
  tag: ProblemTag
  risk: RiskLevel
}

export interface SkinTexts {
  sensitiveSkin: string // 1–2 sentences, in the user's language
  alternative: string // "" when score >= 50
}

export interface WebIngredients {
  name: string
  brand: string
  ingredients: string
  site: string // where the list comes from (grounding source title / domain)
}

export class AIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AIError"
  }
}

const READ_PROMPT =
  "You read photos taken by smart glasses in a store. Look for ONE cosmetic, beauty or personal-care " +
  "product (shampoo, cream, lotion, makeup, deodorant, soap, sunscreen, etc.) in the image. " +
  "Reply with JSON only: " +
  '{"found": boolean, "barcode": string, "barcode_box": [ymin, xmin, ymax, xmax], "brand": string, "name": string, "name_en": string, "ingredients": string}. ' +
  "found=true only if such a product (its package or label) is clearly visible. " +
  "barcode: the EAN/UPC digits printed under the barcode bars (EAN-13 = 13 digits, UPC-A = 12, EAN-8 = 8), " +
  "read them one by one left to right, including the first digit printed to the left of the bars; digits only, no spaces; " +
  "\"\" if you cannot read every digit. " +
  "barcode_box: where the barcode (bars + digits) is in the image, as [ymin, xmin, ymax, xmax] normalized 0-1000 " +
  "from the top-left corner; [] if no barcode is visible. " +
  "brand and name: as printed on the package; \"\" if not visible. " +
  "name_en: the same product name in English as the brand sells it in English-speaking markets including the product type, e.g. \"Shea Butter Hand Cream\" or \"Gel Fantasy Magnetic Press-On Nails\"; \"\" if name is empty. " +
  "ingredients: the full ingredient (INCI) list exactly as printed, comma-separated; \"\" if not legible. " +
  "Never guess or invent text that is not in the image."

function textsPrompt(brand: string, name: string, problems: ProblemIngredient[], score: number, language: string): string {
  const list = problems.length
    ? problems.map((p) => `${p.name} (${p.tag}, ${p.risk} risk)`).join("; ")
    : "none"
  return (
    "You help a shopper with sensitive skin. " +
    `Product: "${name || "unknown"}" by "${brand || "unknown"}". Its score (fixed rules, do not change it) is ${score}/100. ` +
    `Problem ingredients found in its real ingredient list: ${list}. ` +
    "Reply with JSON only: " +
    '{"sensitive_skin": string, "alternative": string}. ' +
    `sensitive_skin: one or two short plain sentences IN ${language.toUpperCase()} about which reactions THESE listed ingredients ` +
    "can cause on sensitive skin; if none, say it has no known problem ingredients (max 40 words, no medical advice, " +
    "do not mention ingredients that are not listed). " +
    `alternative: if score < 50, ONE real, widely available product of the same type without those ingredients (brand + name), ` +
    `written in ${language}, max 10 words; otherwise "".`
  )
}

/** Read barcode / brand / name / ingredients from a JPEG camera frame. */
export function readProduct(owner: BaseScriptComponent, jpegB64: string, timeoutSec: number): Promise<ProductReading> {
  const parts: Part[] = [
    {text: READ_PROMPT},
    {inlineData: {mimeType: "image/jpeg", data: jpegB64}},
  ]
  return askJson(owner, parts, timeoutSec, 0.0).then((j) => ({
    found: !!j.found,
    barcode: String(j.barcode || "").replace(/\D/g, ""),
    brand: cleanStr(j.brand),
    name: cleanStr(j.name),
    nameEn: cleanStr(j.name_en),
    ingredients: cleanStr(j.ingredients),
    barcodeBox: normBox(j.barcode_box),
  }))
}

function normBox(v: any): number[] | null {
  if (!Array.isArray(v) || v.length !== 4) return null
  const b = v.map((x: any) => Number(x))
  if (b.some((x: number) => !isFinite(x))) return null
  const [y0, x0, y1, x1] = b
  if (y1 - y0 < 5 || x1 - x0 < 5) return null
  return [Math.max(0, y0), Math.max(0, x0), Math.min(1000, y1), Math.min(1000, x1)]
}

const BARCODE_PROMPT =
  "Look ONLY at the barcode in this photo. Read the digits printed under the bars, one by one, left to right, " +
  "including the leading digit printed left of the bars. EAN-13 has 13 digits, UPC-A 12, EAN-8 8. " +
  'Reply with JSON only: {"barcode": string} — digits only, "" if any digit is not legible. Never guess.'

/** Barcode-only pass (on the close-up crop, or the full frame when there is no box). */
export function readBarcodeOnly(owner: BaseScriptComponent, jpegB64: string, timeoutSec: number): Promise<string> {
  const parts: Part[] = [{text: BARCODE_PROMPT}, {inlineData: {mimeType: "image/jpeg", data: jpegB64}}]
  return askJson(owner, parts, timeoutSec, 0.0).then((j) => String(j.barcode || "").replace(/\D/g, ""))
}

/** EAN-8 / UPC-A / EAN-13 / GTIN-14 check digit. */
export function isValidGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false
  const digits = code.split("").map((d) => Number(d))
  const check = digits.pop() as number
  let sum = 0
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += (digits[i] as number) * w
  return (10 - (sum % 10)) % 10 === check
}

/** Explanation texts only (the score is computed by fixed rules before this call). */
export function explainForSensitiveSkin(
  owner: BaseScriptComponent,
  brand: string,
  name: string,
  problems: ProblemIngredient[],
  score: number,
  timeoutSec: number,
  language: string
): Promise<SkinTexts> {
  const parts: Part[] = [{text: textsPrompt(brand, name, problems, score, language)}]
  return askJson(owner, parts, timeoutSec, 0.0).then((j) => ({
    sensitiveSkin: cleanStr(j.sensitive_skin),
    alternative: score < 50 ? cleanStr(j.alternative) : "",
  }))
}

/**
 * Real ingredient list from the web (Google Search grounding). Returns null unless Gemini found the
 * exact product AND the answer is backed by grounding sources — never an invented list.
 */
export function findIngredientsOnWeb(
  owner: BaseScriptComponent,
  brand: string,
  name: string,
  barcode: string,
  timeoutSec: number
): Promise<WebIngredients | null> {
  const what = [brand && `brand "${brand}"`, name && `product "${name}"`, barcode && `barcode EAN ${barcode}`].filter((x) => !!x).join(", ")
  const prompt =
    `Search the web for the official, complete INCI ingredient list of this exact cosmetic product: ${what}. ` +
    "Prefer the brand's official website, then major retailers or INCI databases. " +
    'Reply with JSON only (no markdown): {"found": boolean, "brand": string, "name": string, "ingredients": string}. ' +
    "found=false if you cannot find the list of THIS exact product. ingredients: copied exactly as published, comma-separated. " +
    "Never invent or reconstruct a list."
  return new Promise((resolve) => {
    let settled = false
    const done = (v: WebIngredients | null) => {
      if (settled) return
      settled = true
      resolve(v)
    }
    const timer = owner.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    timer.bind(() => {
      print("[BeautyScanAI] web search: timeout")
      done(null)
    })
    timer.reset(timeoutSec)
    const request: any = {
      model: MODELS[0],
      type: "generateContent",
      body: {
        contents: [{role: "user", parts: [{text: prompt}]}],
        tools: [{google_search: {}}],
        generationConfig: {temperature: 0, maxOutputTokens: 2000, thinkingConfig: {thinkingBudget: 0}},
      },
    }
    try {
      Gemini.models(request)
        .then((response: any) => {
          const c = response && response.candidates && response.candidates[0]
          const ps = c && c.content && c.content.parts ? c.content.parts : []
          let text = ""
          for (const p of ps) if (p && p.text) text += p.text
          const chunks: any[] = (c && c.groundingMetadata && c.groundingMetadata.groundingChunks) || []
          const j = extractJson(text)
          const ingredients = cleanStr(j.ingredients)
          const commas = (ingredients.match(/,/g) || []).length
          if (!j.found || ingredients.length < 40 || commas < 4 || chunks.length === 0) {
            print(`[BeautyScanAI] web search: rejected (found=${!!j.found} len=${ingredients.length} sources=${chunks.length})`)
            done(null)
            return
          }
          const w = chunks[0] && chunks[0].web ? chunks[0].web : {}
          const site = cleanStr(w.title || w.domain || "")
          print(`[BeautyScanAI] web search: ingredients from ${site} (${chunks.length} sources)`)
          done({name: cleanStr(j.name), brand: cleanStr(j.brand), ingredients, site})
        })
        .catch((e: any) => {
          print("[BeautyScanAI] web search failed: " + String(e && e.message ? e.message : e).slice(0, 160))
          done(null)
        })
    } catch (e) {
      print("[BeautyScanAI] web search failed: " + String(e).slice(0, 160))
      done(null)
    }
  })
}

// ── internals ──────────────────────────────────────────────────────────────────
function cleanStr(v: any): string {
  return v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim()
}

function extractJson(text: string): any {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
  const a = t.indexOf("{")
  const b = t.lastIndexOf("}")
  if (a < 0 || b <= a) throw new AIError("no JSON in reply")
  return JSON.parse(t.substring(a, b + 1))
}

function callModel(model: string, parts: Part[], temperature: number): Promise<any> {
  const generationConfig: any = {
    temperature,
    responseMimeType: "application/json",
    maxOutputTokens: 1500,
  }
  if (model.indexOf("2.5") >= 0) generationConfig.thinkingConfig = {thinkingBudget: 0}
  const request: any = {
    model,
    type: "generateContent",
    body: {contents: [{role: "user", parts}], generationConfig},
  }
  return Gemini.models(request).then((response: any) => {
    const c = response && response.candidates && response.candidates[0]
    const ps = c && c.content && c.content.parts ? c.content.parts : []
    let text = ""
    for (const p of ps) if (p && p.text) text += p.text
    if (!text) throw new AIError(`${model}: empty reply`)
    return extractJson(text)
  })
}

function askJson(
  owner: BaseScriptComponent,
  parts: Part[],
  timeoutSec: number,
  temperature: number
): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    let settled = false
    const errors: string[] = []
    const timer = owner.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    timer.bind(() => {
      if (settled) return
      settled = true
      reject(new AIError("timeout after " + timeoutSec + " s" + (errors.length ? " (" + errors.join(" | ") + ")" : "")))
    })
    timer.reset(timeoutSec)
    const tryModel = (i: number) => {
      if (settled) return
      if (i >= MODELS.length) {
        settled = true
        reject(new AIError(errors.join(" | ")))
        return
      }
      let p: Promise<any>
      try {
        p = callModel(MODELS[i], parts, temperature)
      } catch (e) {
        errors.push(`${MODELS[i]}: ${String(e).slice(0, 160)}`)
        tryModel(i + 1)
        return
      }
      p.then((j) => {
        if (settled) return
        settled = true
        print(`[BeautyScanAI] ${MODELS[i]} answered`)
        resolve(j)
      }).catch((err: any) => {
        errors.push(`${MODELS[i]}: ${String(err && err.message ? err.message : err).slice(0, 160)}`)
        tryModel(i + 1)
      })
    }
    tryModel(0)
  })
}
