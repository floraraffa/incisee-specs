// Beauty Scan — scan pipeline. Pure orchestration; no scene access.
//
//   camera JPEG → Gemini reads the package (barcode + where it is, brand, name, ingredients)
//     → barcode fails the check digit? crop + enlarge + contrast-boost the barcode, read it again
//   → REAL ingredient list, first that exists:
//       1. Open Beauty Facts by barcode   2. the list printed on the package
//       3. Open Beauty Facts by brand + name   4. INCIDecoder by brand + name
//       5. web search (Google-grounded, with sources)
//     none → "no_data": we say so; we never score from a guess.
//   → score from FIXED rules (BeautyScanRules.ts): same list → same score, every session.
//   → Gemini only writes the sensitive-skin sentence and the alternative.
//
// Products resolved once are cached on the device (persistent storage), so re-scanning the same
// product in another session gives the same list and the same score.

import {explainForSensitiveSkin, findIngredientsOnWeb, isValidGtin, ProblemIngredient, readBarcodeOnly, readProduct} from "./BeautyScanAI"
import {lookupBarcode, OBFResult, searchByName} from "./BeautyScanOBF"
import {scoreIngredients} from "./BeautyScanRules"
import {InciProduct, searchIncidecoder} from "./BeautyScanInci"
import {isNonFormulated, lookupUpc, shortName, UpcProduct} from "./BeautyScanUPC"
import {VerdictKey} from "./BeautyScanI18n"

export type DataSource = "obf" | "package" | "web"

export interface ScanResult {
  name: string
  brand: string
  barcode: string
  score: number
  verdict: VerdictKey
  problems: ProblemIngredient[]
  sensitiveSkin: string
  alternative: string
  source: DataSource
  site: string // web source name when source === "web"
}

export type ScanOutcome =
  | {kind: "result"; result: ScanResult; log: string[]}
  | {kind: "unreadable"; log: string[]}
  | {kind: "no_barcode"; log: string[]} // product seen, but nothing legible (no code, name or ingredients)
  | {kind: "no_data"; product: string; diag: string; log: string[]} // no real ingredient list anywhere → no score
  | {kind: "not_cosmetic"; product: string; log: string[]} // e.g. press-on nails: nothing to list
  | {kind: "bad_code"; log: string[]} // typed code fails the check digit
  | {kind: "offline"; reason: string; log: string[]}

export interface ScanInput {
  b64: string
  texture: Texture | null // same image as b64, for the barcode close-up
}

/** Barcode close-up maker (camera module): returns a JPEG of the crop, or null. */
export type CropFn = (tex: Texture, box: number[], flipY: boolean) => Promise<string | null>

export const VISION_TIMEOUT_SEC = 12
export const BARCODE_RETRY_TIMEOUT_SEC = 8
export const WEB_TIMEOUT_SEC = 15
export const TEXTS_TIMEOUT_SEC = 10
export const OBF_TIMEOUT_SEC = 8

/** Resolve `fallback` if `p` hasn't settled after `sec` seconds (nothing may hang the scan). */
export function withTimeout<T>(owner: BaseScriptComponent, p: Promise<T>, sec: number, fallback: T, label: string): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false
    const t = owner.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    t.bind(() => {
      if (done) return
      done = true
      print(`[BeautyScan] ${label}: timeout after ${sec}s`)
      resolve(fallback)
    })
    t.reset(sec)
    p.then(
      (v) => {
        if (done) return
        done = true
        resolve(v)
      },
      (e) => {
        if (done) return
        done = true
        print(`[BeautyScan] ${label}: ${e}`)
        resolve(fallback)
      }
    )
  })
}

/** Yuka-style bands: ≥75 green excellent, 50–74 yellow good, 25–49 orange mediocre, <25 red bad. */
export function verdictFor(score: number): VerdictKey {
  if (score >= 75) return "excellent"
  if (score >= 50) return "good"
  if (score >= 25) return "mediocre"
  return "bad"
}

export function scoreColor(score: number): vec4 {
  if (score >= 75) return new vec4(0.3, 0.85, 0.42, 1) // green
  if (score >= 50) return new vec4(1.0, 0.85, 0.2, 1) // yellow
  if (score >= 25) return new vec4(1.0, 0.55, 0.15, 1) // orange
  return new vec4(0.95, 0.25, 0.22, 1) // red
}

/** Progress for the prompt pill: 1 read package, 2 barcode zoom, 3 Open Beauty Facts, 4 web, 5 texts. */
export type StageFn = (step: number) => void

/** Camera scan. `onStage(2)` = barcode close-up (UI shows "Ampliando…"). */
export async function runScan(
  owner: BaseScriptComponent,
  internet: InternetModule,
  input: ScanInput,
  aiLanguage: string,
  crop: CropFn,
  onStage: StageFn = () => {}
): Promise<ScanOutcome> {
  const log: string[] = []
  const t0 = getTime()
  const ms = () => Math.round((getTime() - t0) * 1000)

  // 1. Read the package.
  onStage(1)
  let reading
  try {
    reading = await readProduct(owner, input.b64, VISION_TIMEOUT_SEC)
  } catch (e) {
    log.push(`vision failed @${ms()}ms: ${e}`)
    return {kind: "offline", reason: String(e), log}
  }
  log.push(
    `vision @${ms()}ms: found=${reading.found} barcode="${reading.barcode}" box=${JSON.stringify(reading.barcodeBox)} brand="${reading.brand}" name="${reading.name}" ingredients=${reading.ingredients.length} chars`
  )

  // 2. Barcode: if it fails the check digit, read a cropped, enlarged, contrast-boosted close-up.
  let barcode = isValidGtin(reading.barcode) ? reading.barcode : ""
  if (!barcode && reading.found) {
    onStage(2)
    barcode = await rereadBarcode(owner, input, reading.barcodeBox, crop, log)
    log.push(`barcode @${ms()}ms: first="${reading.barcode}" → "${barcode}"`)
  }

  const hasSomething = barcode.length >= 8 || reading.name.length > 0 || reading.brand.length > 0 || reading.ingredients.length > 20
  if (!reading.found) return {kind: "unreadable", log}
  if (!hasSomething) return {kind: "no_barcode", log}

  return finish(owner, internet, {barcode, name: reading.name, nameEn: reading.nameEn, brand: reading.brand, packageIngredients: reading.ingredients}, aiLanguage, log, ms, onStage)
}

/** Barcode typed by hand. */
export async function runCode(
  owner: BaseScriptComponent,
  internet: InternetModule,
  code: string,
  aiLanguage: string,
  onStage: StageFn = () => {}
): Promise<ScanOutcome> {
  const log: string[] = []
  const t0 = getTime()
  const ms = () => Math.round((getTime() - t0) * 1000)
  const digits = code.replace(/\D/g, "")
  log.push(`typed code "${digits}" valid=${isValidGtin(digits)}`)
  if (!isValidGtin(digits)) return {kind: "bad_code", log}
  return finish(owner, internet, {barcode: digits, name: "", nameEn: "", brand: "", packageIngredients: ""}, aiLanguage, log, ms, onStage)
}

// ── internals ──────────────────────────────────────────────────────────────────

interface Known {
  barcode: string
  name: string
  nameEn: string
  brand: string
  packageIngredients: string
}

async function rereadBarcode(owner: BaseScriptComponent, input: ScanInput, box: number[] | null, crop: CropFn, log: string[]): Promise<string> {
  const attempts: {label: string; b64: () => Promise<string | null>}[] = []
  if (box && input.texture) {
    const tex = input.texture
    attempts.push({label: "close-up", b64: () => crop(tex, box, false)})
    attempts.push({label: "close-up (flipped rows)", b64: () => crop(tex, box, true)})
  } else {
    attempts.push({label: "full frame", b64: () => Promise.resolve(input.b64)})
  }
  for (const a of attempts) {
    const img = await withTimeout(owner, a.b64(), 5, null as string | null, "barcode " + a.label)
    if (!img) {
      log.push(`barcode ${a.label}: no image`)
      continue
    }
    let code = ""
    try {
      code = await readBarcodeOnly(owner, img, BARCODE_RETRY_TIMEOUT_SEC)
    } catch (e) {
      log.push(`barcode ${a.label}: failed ${String(e).slice(0, 80)}`)
      continue
    }
    const ok = isValidGtin(code)
    log.push(`barcode ${a.label}: "${code}" ${ok ? "✓" : "✗"}`)
    if (ok) return code
  }
  return ""
}

async function finish(
  owner: BaseScriptComponent,
  internet: InternetModule,
  k: Known,
  aiLanguage: string,
  log: string[],
  ms: () => number,
  onStage: StageFn
): Promise<ScanOutcome> {
  let name = k.name
  let brand = k.brand
  let barcode = k.barcode
  let ingredients = ""
  let source: DataSource | null = null
  let site = ""

  // 0. Same product already resolved on this device → same list, same score.
  const cached = cacheGet(barcode) || cacheGet(nameKey(brand, name))
  if (cached) {
    name = name || cached.name
    brand = brand || cached.brand
    barcode = barcode || cached.barcode
    ingredients = cached.ingredients
    source = cached.source
    site = cached.site
    log.push(`cache hit (${source})`)
  }

  // 1. Open Beauty Facts by barcode.
  if (!source) onStage(3)
  if (!source && barcode) {
    const obf = await withTimeout(owner, lookupBarcode(internet, barcode), OBF_TIMEOUT_SEC, {status: "error", reason: "timeout"} as OBFResult, "obf code")
    log.push(`obf code @${ms()}ms: ${obf.status}${obf.status === "error" ? " " + obf.reason : ""}`)
    if (obf.status === "found") {
      if (obf.product.name) name = obf.product.name
      if (obf.product.brand) brand = obf.product.brand
      if (obf.product.ingredients.length > 20) {
        ingredients = obf.product.ingredients
        source = "obf"
      }
    }
  }
  // 1b. Barcode unknown to OBF → product name from UPCitemdb, so INCIDecoder can be searched.
  if (!source && barcode && (!brand || !name)) {
    const upc = await withTimeout(owner, lookupUpc(internet, barcode), OBF_TIMEOUT_SEC, null as UpcProduct | null, "upc")
    log.push(`upc @${ms()}ms: ${upc ? upc.title.slice(0, 60) : "none"}`)
    if (upc) {
      if (isNonFormulated(upc.title)) return {kind: "not_cosmetic", product: upc.title.slice(0, 50), log}
      brand = brand || upc.brand
      name = name || shortName(upc.title, upc.brand)
    }
  }
  if (!source && isNonFormulated(name + " " + k.nameEn)) return {kind: "not_cosmetic", product: [brand, name].join(" ").trim(), log}
  // 2. The list printed on the package.
  if (!source && k.packageIngredients.length > 20) {
    ingredients = k.packageIngredients
    source = "package"
  }
  // 3. Open Beauty Facts by brand + name.
  if (!source && brand && name) {
    const obf = await withTimeout(owner, searchByName(internet, brand, name), OBF_TIMEOUT_SEC, {status: "error", reason: "timeout"} as OBFResult, "obf name")
    log.push(`obf name @${ms()}ms: ${obf.status}${obf.status === "error" ? " " + obf.reason : ""}`)
    if (obf.status === "found") {
      ingredients = obf.product.ingredients
      if (!barcode && isValidGtin(obf.product.barcode)) barcode = obf.product.barcode
      source = "obf"
    }
  }
  // 4. INCIDecoder (public database of published ingredient lists) by brand + name.
  if (!source && (brand || name || barcode)) onStage(4)
  if (!source && (brand || name)) {
    let inci = await withTimeout(owner, searchIncidecoder(internet, brand, name), OBF_TIMEOUT_SEC, null as InciProduct | null, "incidecoder")
    if (!inci && k.nameEn && k.nameEn.toLowerCase() !== name.toLowerCase())
      inci = await withTimeout(owner, searchIncidecoder(internet, brand, k.nameEn), OBF_TIMEOUT_SEC, null as InciProduct | null, "incidecoder en")
    log.push(`incidecoder @${ms()}ms: ${inci ? inci.title + " (" + inci.url + ")" : "none"}`)
    if (inci) {
      ingredients = inci.ingredients
      // Show the exact product whose list we used (it may be a sibling, e.g. the Rose soap).
      name = stripBrand(inci.title, brand) || name
      site = "INCIDecoder"
      source = "web"
    }
  }
  // 5. Web search with sources.
  if (!source && (brand || name || barcode)) {
    const web = await findIngredientsOnWeb(owner, brand, name, barcode, WEB_TIMEOUT_SEC)
    log.push(`web @${ms()}ms: ${web ? "found on " + web.site : "none"}`)
    if (web) {
      ingredients = web.ingredients
      name = name || web.name
      brand = brand || web.brand
      site = web.site
      source = "web"
    }
  }
  if (!source) {
    const product = [brand, name].filter((x) => !!x).join(" ")
    // Short "where we looked" line, shown on the glasses (the Logger panel cuts long lines).
    const diag = log
      .filter((l) => /^(obf code|upc|obf name|incidecoder|web) @/.test(l))
      .map((l) => l.replace(/ @\d+ms:/, ":").slice(0, 40))
      .join(" · ")
    return {kind: "no_data", product: product || barcode, diag, log}
  }
  if (!cached) cachePut({barcode, name, brand, ingredients, source, site}, [barcode, nameKey(k.brand, k.name), nameKey(brand, name)])

  // 5. Fixed-rule score.
  const rs = scoreIngredients(ingredients)
  log.push(`rules @${ms()}ms: score=${rs.score} problems=${rs.problems.map((p) => p.name + "/" + p.risk).join(", ") || "none"} source=${source}`)

  // 6. Texts (never fatal: without them the card still shows the real data).
  onStage(5)
  let sensitiveSkin = ""
  let alternative = ""
  try {
    const t = await explainForSensitiveSkin(owner, brand, name, rs.problems.slice(0, 8), rs.score, TEXTS_TIMEOUT_SEC, aiLanguage)
    sensitiveSkin = t.sensitiveSkin
    alternative = t.alternative
  } catch (e) {
    log.push(`texts failed @${ms()}ms: ${String(e).slice(0, 120)}`)
  }

  return {
    kind: "result",
    log,
    result: {
      name, // "" → the UI shows the localized "unnamed product"
      brand,
      barcode,
      score: rs.score,
      verdict: verdictFor(rs.score),
      problems: rs.problems,
      sensitiveSkin,
      alternative,
      source,
      site,
    },
  }
}

// ── On-device cache (persistent storage) ───────────────────────────────────────
interface CacheEntry {
  keys: string[]
  barcode: string
  name: string
  brand: string
  ingredients: string
  source: DataSource
  site: string
}
const CACHE_KEY = "beautyscan_products_v1"
const CACHE_MAX = 12

function nameKey(brand: string, name: string): string {
  const s = (brand + "|" + name).toLowerCase().replace(/[^a-z0-9|]+/g, "")
  return brand && name ? "n:" + s : ""
}

function cacheLoad(): CacheEntry[] {
  try {
    const raw = global.persistentStorageSystem.store.getString(CACHE_KEY)
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v : []
  } catch (e) {
    return []
  }
}

function cacheGet(key: string): CacheEntry | null {
  if (!key) return null
  for (const e of cacheLoad()) if (e.keys && e.keys.indexOf(key) >= 0) return e
  return null
}

function cachePut(e: Omit<CacheEntry, "keys">, keys: string[]): void {
  try {
    const k = keys.filter((x, i) => !!x && keys.indexOf(x) === i)
    if (!k.length) return
    const list = cacheLoad().filter((o) => !o.keys.some((x) => k.indexOf(x) >= 0))
    list.unshift({...e, ingredients: e.ingredients.slice(0, 1500), keys: k})
    global.persistentStorageSystem.store.putString(CACHE_KEY, JSON.stringify(list.slice(0, CACHE_MAX)))
  } catch (err) {
    print("[BeautyScan] cache write failed: " + err)
  }
}

/** "L´Occitane Shea Butter Hand Cream" + "L'OCCITANE" → "Shea Butter Hand Cream". */
function stripBrand(title: string, brand: string): string {
  const flat = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "")
  const b = flat(brand)
  const words = title.trim().split(/\s+/)
  if (b && words.length > 1 && flat(words[0]).length >= 2 && b.indexOf(flat(words[0])) === 0) return words.slice(1).join(" ")
  return title.trim()
}
