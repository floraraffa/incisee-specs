// Beauty Scan — INCIDecoder lookup (https://incidecoder.com): a public database of real, published
// cosmetic ingredient lists. Used when Open Beauty Facts has no list for the product.
// Search by brand + name → first result whose title has the brand and a word of the name →
// product page → ingredient names from the "Ingredients overview" list.

export interface InciProduct {
  title: string
  ingredients: string // comma-separated INCI names
  url: string
}

const UA = {"User-Agent": "BeautyScanLens/1.0 (Spectacles)"}
// incidecoder.com now 301-redirects to inkeedecoder.com; try the new host first and follow redirects by hand.
const HOSTS = ["https://inkeedecoder.com", "https://incidecoder.com"]

async function get(internet: InternetModule, path: string): Promise<string> {
  let lastErr = ""
  for (const host of HOSTS) {
    let url = host + path
    for (let hop = 0; hop < 3; hop++) {
      const r = await internet.fetch(url, {method: "GET", headers: UA})
      if (r.status === 200) return await r.text()
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers ? r.headers.get("location") || r.headers.get("Location") : ""
        if (!loc) break
        url = loc.indexOf("http") === 0 ? loc : host + loc
        continue
      }
      lastErr = "HTTP " + r.status
      break
    }
  }
  throw new Error("incidecoder " + (lastErr || "redirect"))
}

export async function searchIncidecoder(internet: InternetModule, brand: string, name: string): Promise<InciProduct | null> {
  const b = norm(brand)
  if (!b && !name) return null
  const query = encodeURIComponent(norm(brand + " " + name)).replace(/%20/g, "+")
  const html = await get(internet, `/search?query=${query}`)

  const bWords = b.split(" ").filter((w) => w.length >= 3)
  const nWords = norm(name)
    .split(" ")
    .filter((w) => w.length >= 4)
  // Best match: brand present, most words of the name present (≥ 60 %), then fewest extra words.
  const re = /href="(\/products\/[a-z0-9-]+)"[^>]*class="[^"]*simpletextlistitem[^"]*"[^>]*>([^<]+)</g
  let m: RegExpExecArray | null
  let path = ""
  let title = ""
  let best = -1
  while ((m = re.exec(html)) !== null) {
    const t = norm(decode(m[2]))
    const tFlat = t.replace(/ /g, "")
    if (bWords.length && !bWords.some((w) => tFlat.indexOf(w) >= 0)) continue
    const hits = nWords.filter((w) => t.indexOf(w) >= 0).length
    const cover = nWords.length ? hits / nWords.length : 1
    if (cover < 0.6) continue
    const extra = Math.max(0, t.split(" ").length - nWords.length - bWords.length)
    const score = cover * 100 - extra
    if (score > best) {
      best = score
      path = m[1]
      title = decode(m[2]).trim()
    }
  }
  if (!path) return null

  const ph = await get(internet, path)
  const start = ph.indexOf('id="ingredlist-short"')
  if (start < 0) return null
  const rest = ph.substring(start)
  const endIdx = rest.indexOf("<h2", 50)
  const seg = endIdx > 0 ? rest.substring(0, endIdx) : rest.substring(0, 60000)
  const names: string[] = []
  const ire = /class="ingred-link[^"]*"\s*>([^<]+)<\/a>/g
  let im: RegExpExecArray | null
  while ((im = ire.exec(seg)) !== null) {
    const n = decode(im[1]).replace(/​/g, "").trim()
    if (n) names.push(n)
  }
  if (names.length < 3) return null
  return {title, ingredients: names.join(", "), url: "incidecoder.com" + path}
}

function decode(s: string): string {
  return s
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[´'’`]/g, "")
    .replace(/[àáâãäå]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/(i)s(ing|er|ed)\b/g, "$1z$2") // moisturising → moisturizing
    .replace(/\s+/g, " ")
    .trim()
}
