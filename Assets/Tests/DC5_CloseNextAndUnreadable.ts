// DC5 — Pressing CLOSE hides the card and brings back the scan frame; scanning a different
// product gives a different result. With no product in view, the "couldn't read" message shows
// instead of a card.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {STRINGS} from "../Scripts/BeautyScanI18n"
import {
  BeautyScanTester,
  enabledInHierarchy,
  FIXTURE_BLANK,
  FIXTURE_NIVEA,
  FIXTURE_PANTENE,
  mainScript,
  textOf,
} from "./BeautyScanTestKit"

@component
export class DC5_CloseNextAndUnreadable extends Scenario {
  async run(): Promise<void> {
    const it = new BeautyScanTester()
    await sleep(500)
    const main = mainScript()

    // First product.
    if (!(main.state === "result" && main.lastResult && main.lastResult.barcode === "4084500943827")) {
      expect(await it.scanFixture(FIXTURE_PANTENE)).toBe("result")
    }
    const first = main.lastResult!
    const firstName = textOf("CardName")

    // CERRAR hides the card and brings back the frame.
    await it.pressClose()
    expect(enabledInHierarchy("ResultCard")).toBe(false)
    expect(enabledInHierarchy("ScanFrame")).toBe(true)
    expect(enabledInHierarchy("ScanButton")).toBe(true)
    expect(main.state).toBe("idle")

    // A different product → a different result.
    expect(await it.scanFixture(FIXTURE_NIVEA)).toBe("result")
    const second = main.lastResult!
    const secondName = textOf("CardName")
    print(`[DC5] first="${firstName}" ${first.score}/100 (${first.barcode}); second="${secondName}" ${second.score}/100 (${second.barcode})`)
    expect(secondName !== firstName).toBe(true)
    expect(second.barcode !== first.barcode).toBe(true)
    expect(secondName.toLowerCase().indexOf("pantene") < 0).toBe(true)

    // No product in view → "couldn't read", no card.
    expect(await it.scanFixture(FIXTURE_BLANK)).toBe("unreadable")
    expect(enabledInHierarchy("ResultCard")).toBe(false)
    expect(enabledInHierarchy("ScanFrame")).toBe(true)
    expect(textOf("ScanPromptText")).toBe(STRINGS.es.unreadable)
  }
}
