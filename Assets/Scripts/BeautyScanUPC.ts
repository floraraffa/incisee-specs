// Beauty Scan — barcode → product name (UPCitemdb free lookup, https://www.upcitemdb.com).
// Used when Open Beauty Facts doesn't know the barcode, so a typed or scanned code still gives
// a brand + name to search INCIDecoder with. Gives names only, never ingredients.

export interface UpcProduct {
  brand: string
  title: string
}

export async function lookupUpc(internet: InternetModule, code: string): Promise<UpcProduct | null> {
  const res = await internet.fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, {
    method: "GET",
    headers: {Accept: "application/json"},
  })
  if (res.status !== 200) throw new Error("upc HTTP " + res.status)
  const data = (await res.json()) as {items?: {title?: string; brand?: string}[]}
  const item = data && data.items && data.items[0]
  if (!item || !item.title) return null
  return {brand: (item.brand || "").trim(), title: item.title.replace(/\s+/g, " ").trim()}
}

/** Short product name for searching: drop the brand and the size / count / colour tail. */
export function shortName(title: string, brand: string): string {
  let t = title
  if (brand && t.toLowerCase().indexOf(brand.toLowerCase()) === 0) t = t.substring(brand.length)
  t = t.split(/,| - | \| |\d+(\.\d+)?\s?(ml|fl|oz|g|count|ct|pcs)\b/i)[0]
  return t.split(" ").filter((w) => !!w).slice(0, 6).join(" ").trim()
}

/** Products that are not formulated cosmetics, so they have no ingredient list to look up. */
export function isNonFormulated(text: string): boolean {
  return /press[- ]?on|false nails?|fake nails?|artificial nails?|nail tips|ready[- ]to[- ]wear (gel )?nails|u[ñn]as postizas|false (eye)?lash|strip lash|pesta[ñn]as postizas|tweezer|brush(es)?\b|sponge|pinza|esponja/i.test(
    text
  )
}
