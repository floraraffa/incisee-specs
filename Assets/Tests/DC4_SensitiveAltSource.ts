// DC4 — The card explains which reactions it can cause for sensitive skin, shows a better
// alternative when the score is below 50, and says where the data came from.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {STRINGS} from "../Scripts/BeautyScanI18n"
import {BeautyScanTester, enabledInHierarchy, FIXTURE_PANTENE, mainScript, textOf} from "./BeautyScanTestKit"

@component
export class DC4_SensitiveAltSource extends Scenario {
  async run(): Promise<void> {
    const it = new BeautyScanTester()
    await sleep(500)
    const main = mainScript()
    const fresh = !(main.state === "result" && main.lastResult && main.lastResult.barcode === "4084500943827")
    if (fresh) expect(await it.scanFixture(FIXTURE_PANTENE)).toBe("result")
    const r = main.lastResult!
    expect(enabledInHierarchy("ResultCard")).toBe(true)

    const sensitive = textOf("SensitiveText")
    print(`[DC4] sensitive="${sensitive}"`)
    expect(textOf("SensitiveHeaderText")).toBe("Para piel sensible")
    expect(sensitive.length > 15).toBe(true)

    const alt = textOf("AlternativeText")
    print(`[DC4] score=${r.score} alt="${alt}"`)
    if (r.score < 50) {
      expect(alt.indexOf("Alternativa mejor: ") === 0 && alt.length > "Alternativa mejor: ".length + 3).toBe(true)
    } else {
      expect(alt).toBe("")
    }

    const src = textOf("SourceText")
    print(`[DC4] source="${src}" (barcode ${r.barcode})`)
    const labels = Object.keys(STRINGS.es.source).map((k) => (STRINGS.es.source as Record<string, string>)[k])
    expect(labels.some((l) => src.indexOf(l) >= 0)).toBe(true)
    // This barcode is in Open Beauty Facts with an ingredient list.
    if (r.barcode === "4084500943827") expect(src.indexOf(STRINGS.es.source.obf) >= 0).toBe(true)
    expect(textOf("DisclaimerText")).toBe(STRINGS.es.disclaimer)
  }
}
