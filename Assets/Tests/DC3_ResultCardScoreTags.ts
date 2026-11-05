// DC3 — With a real beauty product in view, a result card appears with the product name, a
// 0–100 score with the right color, and a list of problem ingredients, each tagged.
// Product photo: Pantene Pro-V Shampoo label (real OBF record) injected as the camera frame.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {scoreColor, verdictFor} from "../Scripts/BeautyScanPipeline"
import {
  BeautyScanTester,
  enabledInHierarchy,
  FIXTURE_PANTENE,
  inCameraSpace,
  mainScript,
  sameColor,
  textColorOf,
  textOf,
  VALID_TAG_LABELS,
} from "./BeautyScanTestKit"

@component
export class DC3_ResultCardScoreTags extends Scenario {
  async run(): Promise<void> {
    const it = new BeautyScanTester()
    await sleep(500)
    const outcome = await it.scanFixture(FIXTURE_PANTENE)
    expect(outcome).toBe("result")
    const main = mainScript()
    const r = main.lastResult!

    expect(enabledInHierarchy("ResultCard")).toBe(true)
    expect(enabledInHierarchy("ScanFrame")).toBe(false)
    const name = textOf("CardName")
    print(`[DC3] name="${name}" subtitle="${textOf("CardSubtitle")}" score=${textOf("ScoreNumber")} verdict=${textOf("VerdictText")}`)
    expect(name.toLowerCase().indexOf("pantene") >= 0 || name.toLowerCase().indexOf("pro-v") >= 0).toBe(true)

    // Score 0–100, verdict and color match the Yuka bands.
    const score = parseInt(textOf("ScoreNumber"), 10)
    expect(score >= 0 && score <= 100).toBe(true)
    expect(score).toBe(r.score)
    expect(textOf("VerdictText")).toBe(verdictFor(score))
    expect(sameColor(textColorOf("VerdictText"), scoreColor(score))).toBe(true)

    // Problem ingredients, each tagged with an allowed label.
    expect(r.problems.length >= 1).toBe(true)
    for (let i = 0; i < r.problems.length; i++) {
      const n = textOf("IngredientName" + i)
      const t = textOf("IngredientTag" + i)
      print(`[DC3]   ${n} — ${t} (${r.problems[i].risk})`)
      expect(n.length > 0).toBe(true)
      expect(VALID_TAG_LABELS.indexOf(t) >= 0).toBe(true)
      expect(enabledInHierarchy("RiskDot" + i)).toBe(true)
    }
    // MIT / MCI are on this real label — at least one should be flagged as an allergen.
    expect(r.problems.some((p) => p.tag === "allergen")).toBe(true)

    // Card sits to the left, ~45 cm away, inside the view.
    const c = inCameraSpace("ResultCard")
    print(`[DC3] card in camera space: ${c}`)
    expect(c.x < 0 && c.x > -10).toBe(true)
    expect(c.z > 40 && c.z < 50).toBe(true)
  }
}
