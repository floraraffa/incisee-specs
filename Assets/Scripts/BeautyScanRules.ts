// Beauty Scan — deterministic ingredient scoring.
// The score is NOT asked to the AI any more: the same ingredient list always gives the same score.
// Each problem ingredient below is matched against the real INCI list (Open Beauty Facts, the package,
// or the brand's web page). Sources for the classifications: EU Cosmetics Regulation 1223/2009
// (Annex II/III, the 26 labelled fragrance allergens), SCCS opinions, and the EU endocrine-disruptor
// priority lists. Penalties are fixed per risk level.

import {ProblemIngredient, ProblemTag, RiskLevel} from "./BeautyScanAI"

interface Rule {
  name: string // display name (INCI)
  re: RegExp
  tag: ProblemTag
  risk: RiskLevel
}

// Order matters: the first rule that matches an ingredient wins (specific names before generic ones).
const RULES: Rule[] = [
  // Heavy metals
  {name: "Lead", re: /\blead\b(?![- ]?free)|plumbum/, tag: "heavy_metal", risk: "high"},
  {name: "Mercury / Thimerosal", re: /\bmercury\b|thimerosal|thiomersal/, tag: "heavy_metal", risk: "high"},
  {name: "Cadmium", re: /\bcadmium\b/, tag: "heavy_metal", risk: "high"},
  {name: "Arsenic", re: /\barsenic\b/, tag: "heavy_metal", risk: "high"},
  // Strong allergens / preservatives
  {name: "Methylchloroisothiazolinone", re: /methylchloroisothiazolinone/, tag: "allergen", risk: "high"},
  {name: "Methylisothiazolinone", re: /methylisothiazolinone/, tag: "allergen", risk: "high"},
  {name: "Methyldibromo Glutaronitrile", re: /methyldibromo ?glutaronitrile/, tag: "allergen", risk: "high"},
  {name: "Formaldehyde", re: /\bformaldehyde\b|\bformalin\b/, tag: "allergen", risk: "high"},
  {name: "DMDM Hydantoin", re: /dmdm ?hydantoin/, tag: "allergen", risk: "high"},
  {name: "Imidazolidinyl Urea", re: /imidazolidinyl ?urea/, tag: "allergen", risk: "high"},
  {name: "Diazolidinyl Urea", re: /diazolidinyl ?urea/, tag: "allergen", risk: "high"},
  {name: "Quaternium-15", re: /quaternium-?15\b/, tag: "allergen", risk: "high"},
  {name: "Bronopol", re: /bronopol|2-bromo-2-nitropropane/, tag: "allergen", risk: "high"},
  {name: "Hydroxyisohexyl 3-Cyclohexene Carboxaldehyde", re: /hydroxyisohexyl ?3-?cyclohexene|\blyral\b/, tag: "allergen", risk: "high"},
  {name: "p-Phenylenediamine", re: /p-?phenylenediamine|\bppd\b/, tag: "allergen", risk: "high"},
  {name: "Sodium Hydroxymethylglycinate", re: /sodium hydroxymethylglycinate/, tag: "allergen", risk: "medium"},
  {name: "Chloroacetamide", re: /chloroacetamide/, tag: "allergen", risk: "medium"},
  {name: "Polyaminopropyl Biguanide", re: /polyaminopropyl biguanide|polyhexamethylene biguanide/, tag: "allergen", risk: "medium"},
  {name: "Oak Moss / Tree Moss", re: /evernia prunastri|evernia furfuracea|oak ?moss|tree ?moss/, tag: "allergen", risk: "medium"},
  {name: "Isoeugenol", re: /isoeugenol/, tag: "allergen", risk: "medium"},
  {name: "Hydroxycitronellal", re: /hydroxycitronellal/, tag: "allergen", risk: "medium"},
  {name: "Hexyl Cinnamal", re: /hexyl ?cinnamal/, tag: "allergen", risk: "low"},
  {name: "Amyl Cinnamal", re: /amyl ?cinnamal|amylcinnamyl alcohol/, tag: "allergen", risk: "low"},
  {name: "Cinnamal", re: /\bcinnamal\b|cinnamaldehyde/, tag: "allergen", risk: "medium"},
  {name: "Parfum / Fragrance", re: /\bparfum\b|\bfragrance\b|\bperfume\b/, tag: "allergen", risk: "medium"},
  // Endocrine disruptors
  {name: "Butylphenyl Methylpropional", re: /butylphenyl ?methylpropional|\blilial\b/, tag: "endocrine_disruptor", risk: "high"},
  {name: "Propylparaben / Butylparaben", re: /(propyl|butyl|isobutyl|isopropyl|benzyl|pentyl|phenyl)-?paraben/, tag: "endocrine_disruptor", risk: "high"},
  {name: "BHA", re: /\bbha\b|butylated hydroxyanisole/, tag: "endocrine_disruptor", risk: "high"},
  {name: "Triclosan", re: /triclosan/, tag: "endocrine_disruptor", risk: "high"},
  {name: "Benzophenone-3", re: /benzophenone-?3|oxybenzone/, tag: "endocrine_disruptor", risk: "high"},
  {name: "Ethylhexyl Methoxycinnamate", re: /ethylhexyl methoxycinnamate|octinoxate|octyl methoxycinnamate/, tag: "endocrine_disruptor", risk: "high"},
  {name: "4-Methylbenzylidene Camphor", re: /methylbenzylidene camphor|enzacamene/, tag: "endocrine_disruptor", risk: "high"},
  {name: "Cyclotetrasiloxane (D4)", re: /cyclotetrasiloxane/, tag: "endocrine_disruptor", risk: "high"},
  {name: "BHT", re: /\bbht\b|butylated hydroxytoluene/, tag: "endocrine_disruptor", risk: "medium"},
  {name: "Homosalate", re: /homosalate/, tag: "endocrine_disruptor", risk: "medium"},
  {name: "Octocrylene", re: /octocrylene/, tag: "endocrine_disruptor", risk: "medium"},
  {name: "Cyclopentasiloxane (D5)", re: /cyclopentasiloxane/, tag: "endocrine_disruptor", risk: "medium"},
  {name: "Resorcinol", re: /resorcinol/, tag: "endocrine_disruptor", risk: "medium"},
  {name: "Cyclohexasiloxane (D6)", re: /cyclohexasiloxane/, tag: "endocrine_disruptor", risk: "low"},
  {name: "Methylparaben / Ethylparaben", re: /(methyl|ethyl)-?paraben/, tag: "endocrine_disruptor", risk: "low"},
  // Irritants
  {name: "Hydroquinone", re: /hydroquinone/, tag: "irritant", risk: "high"},
  {name: "Sodium Lauryl Sulfate", re: /(sodium|ammonium) (lauryl|dodecyl) sulfate/, tag: "irritant", risk: "medium"},
  {name: "Alcohol Denat.", re: /alcohol denat|denatured alcohol|\bsd alcohol/, tag: "irritant", risk: "medium"},
  {name: "Benzalkonium Chloride", re: /benzalkonium chloride/, tag: "irritant", risk: "medium"},
  {name: "Sodium Laureth Sulfate", re: /(sodium|ammonium) laureth sulfate/, tag: "irritant", risk: "low"},
  {name: "Phenoxyethanol", re: /phenoxyethanol/, tag: "irritant", risk: "low"},
  {name: "Propylene Glycol", re: /propylene glycol/, tag: "irritant", risk: "low"},
  {name: "Triethanolamine", re: /triethanolamine/, tag: "irritant", risk: "low"},
  {name: "PEG / PPG compounds", re: /\b(peg|ppg)-\d+/, tag: "irritant", risk: "low"},
  // Labelled fragrance allergens (EU list of 26) and mild sensitizers
  {name: "Limonene", re: /limonene/, tag: "allergen", risk: "low"},
  {name: "Linalool", re: /linalool/, tag: "allergen", risk: "low"},
  {name: "Citronellol", re: /citronellol/, tag: "allergen", risk: "low"},
  {name: "Geraniol", re: /geraniol/, tag: "allergen", risk: "low"},
  {name: "Citral", re: /\bcitral\b/, tag: "allergen", risk: "low"},
  {name: "Coumarin", re: /coumarin/, tag: "allergen", risk: "low"},
  {name: "Eugenol", re: /\beugenol\b/, tag: "allergen", risk: "low"},
  {name: "Benzyl Benzoate", re: /benzyl benzoate/, tag: "allergen", risk: "low"},
  {name: "Benzyl Salicylate", re: /benzyl salicylate/, tag: "allergen", risk: "low"},
  {name: "Benzyl Cinnamate", re: /benzyl cinnamate/, tag: "allergen", risk: "low"},
  {name: "Benzyl Alcohol", re: /\bbenzyl alcohol\b/, tag: "allergen", risk: "low"},
  {name: "Cinnamyl Alcohol", re: /cinnamyl alcohol/, tag: "allergen", risk: "low"},
  {name: "Farnesol", re: /farnesol/, tag: "allergen", risk: "low"},
  {name: "Alpha-Isomethyl Ionone", re: /isomethyl ionone/, tag: "allergen", risk: "low"},
  {name: "Anise Alcohol", re: /anis(e|yl) alcohol/, tag: "allergen", risk: "low"},
  {name: "Cocamidopropyl Betaine", re: /cocamidopropyl betaine/, tag: "allergen", risk: "low"},
  {name: "Chlorphenesin", re: /chlorphenesin/, tag: "allergen", risk: "low"},
  {name: "Lanolin", re: /\blanolin\b/, tag: "allergen", risk: "low"},
]

const PENALTY: Record<RiskLevel, number> = {high: 30, medium: 12, low: 4}
const RISK_ORDER: Record<RiskLevel, number> = {high: 0, medium: 1, low: 2}
/** A single high-risk ingredient keeps the product out of the green / yellow bands. */
const HIGH_RISK_CAP = 45
const MIN_SCORE = 5

export interface RuleScore {
  score: number
  problems: ProblemIngredient[] // all matches, most risky first
}

/** Split an INCI list into normalized ingredient names. */
export function splitIngredients(list: string): string[] {
  return list
    .toLowerCase()
    .replace(/\([^)]*\)/g, (m) => m.replace(/,/g, " ")) // commas inside parentheses
    .split(/[,;•·\n]|\s\/\s|\.\s/)
    .map((s) => s.replace(/^[\s*\-:]+|[\s*.]+$/g, "").replace(/\s+/g, " "))
    .filter((s) => s.length > 1)
}

/** Fixed-rule score: 100 minus a fixed penalty per problem ingredient. Same list → same score. */
export function scoreIngredients(list: string): RuleScore {
  const seen: {[name: string]: boolean} = {}
  const problems: ProblemIngredient[] = []
  for (const ing of splitIngredients(list)) {
    for (const r of RULES) {
      if (!r.re.test(ing)) continue
      if (!seen[r.name]) {
        seen[r.name] = true
        problems.push({name: r.name, tag: r.tag, risk: r.risk})
      }
      break
    }
  }
  problems.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk])
  let score = 100
  for (const p of problems) score -= PENALTY[p.risk]
  if (problems.some((p) => p.risk === "high")) score = Math.min(score, HIGH_RISK_CAP)
  return {score: Math.max(MIN_SCORE, score), problems}
}
