// Beauty Scan — Open Beauty Facts lookup by barcode (InternetModule fetch).
// https://world.openbeautyfacts.org/api/v2/product/<barcode>.json

export interface OBFProduct {
  barcode: string
  name: string
  brand: string
  ingredients: string // "" when the database has no ingredient list
}

export type OBFResult = {status: "found"; product: OBFProduct} | {status: "not_found"} | {status: "error"; reason: string}

const FIELDS = "code,product_name,brands,ingredients_text,ingredients_text_es,ingredients_text_en"

export async function lookupBarcode(internet: InternetModule, barcode: string): Promise<OBFResult> {
  if (!/^\d{8,14}$/.test(barcode)) return {status: "not_found"}
  const url = `https://world.openbeautyfacts.org/api/v2/product/${barcode}.json?fields=${FIELDS}`
  try {
    const response = await internet.fetch(url, {method: "GET", headers: {"User-Agent": "BeautyScanLens/1.0 (Spectacles)"}})
    if (response.status === 404) return {status: "not_found"}
    if (response.status !== 200) return {status: "error", reason: "HTTP " + response.status}
    const json = await response.json()
    if (!json || json.status !== 1 || !json.product) return {status: "not_found"}
    const p = json.product
    const ingredients = String(p.ingredients_text || p.ingredients_text_es || p.ingredients_text_en || "")
      .replace(/\s+/g, " ")
      .trim()
    return {
      status: "found",
      product: {
        barcode,
        name: String(p.product_name || "").trim(),
        brand: String(p.brands || "").split(",")[0].trim(),
        ingredients,
      },
    }
  } catch (e) {
    return {status: "error", reason: String(e).slice(0, 160)}
  }
}

/**
 * Search Open Beauty Facts by brand + name (used when the barcode can't be read). Only accepts a
 * product whose brand matches and that shares a significant word with the name, and has an
 * ingredient list — otherwise "not_found" (no near-miss products).
 */
export async function searchByName(internet: InternetModule, brand: string, name: string): Promise<OBFResult> {
  const b = norm(brand)
  if (!b || !name) return {status: "not_found"}
  const terms = encodeURIComponent((brand + " " + name).trim())
  const url =
    `https://world.openbeautyfacts.org/cgi/search.pl?search_terms=${terms}&search_simple=1&action=process&json=1&page_size=8` +
    `&fields=${FIELDS}`
  try {
    const response = await internet.fetch(url, {method: "GET", headers: {"User-Agent": "BeautyScanLens/1.0 (Spectacles)"}})
    if (response.status !== 200) return {status: "error", reason: "HTTP " + response.status}
    const json = await response.json()
    const products: any[] = (json && json.products) || []
    const words = norm(name)
      .split(" ")
      .filter((w) => w.length >= 4)
    for (const p of products) {
      const pb = norm(String(p.brands || ""))
      const pn = norm(String(p.product_name || ""))
      const ingredients = String(p.ingredients_text || p.ingredients_text_es || p.ingredients_text_en || "")
        .replace(/\s+/g, " ")
        .trim()
      if (ingredients.length < 20) continue
      if (!pb || (pb.indexOf(b) < 0 && b.indexOf(pb) < 0)) continue
      if (words.length && !words.some((w) => pn.indexOf(w) >= 0)) continue
      return {
        status: "found",
        product: {barcode: String(p.code || ""), name: String(p.product_name || "").trim(), brand: String(p.brands || "").split(",")[0].trim(), ingredients},
      }
    }
    return {status: "not_found"}
  } catch (e) {
    return {status: "error", reason: String(e).slice(0, 160)}
  }
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[àáâãäå]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
