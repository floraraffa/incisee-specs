// DC1 — The scan frame, the hint and the SCAN button appear in front of me; the live camera
// feed is running.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {STRINGS} from "../Scripts/BeautyScanI18n"
import {BeautyScanTester, enabledInHierarchy, inCameraSpace, mainScript, textOf, waitFor} from "./BeautyScanTestKit"

@component
export class DC1_ScanFrameAndCamera extends Scenario {
  async run(): Promise<void> {
    const it = new BeautyScanTester()
    await sleep(800)
    await it.reset()
    const main = mainScript()

    expect(enabledInHierarchy("ScanFrame")).toBe(true)
    expect(enabledInHierarchy("ScanButton")).toBe(true)
    expect(enabledInHierarchy("ResultCard")).toBe(false)
    expect(textOf("ScanPromptText")).toBe(STRINGS.es.promptHint)
    expect(textOf("ScanLabel")).toBe("ESCANEAR")

    // In front of the user: frame ~40 cm ahead, centred, a little below eye level; prompt above,
    // button below, all inside the field of view (±12 cm horizontally, ±14 cm vertically at 40 cm).
    const f = inCameraSpace("ScanFrame")
    const b = inCameraSpace("ScanButton")
    const p = inCameraSpace("ScanPrompt")
    print(`[DC1] frame=${f} button=${b} prompt=${p}`)
    expect(f.z > 35 && f.z < 45).toBe(true)
    expect(Math.abs(f.x) < 2).toBe(true)
    expect(f.y < 0 && f.y > -8).toBe(true)
    expect(b.y < f.y - 5).toBe(true)
    expect(p.y > f.y + 5).toBe(true)
    for (const v of [f, b, p]) expect(Math.abs(v.x) < 12 && Math.abs(v.y) < 14).toBe(true)

    // Live camera: frames keep arriving.
    await waitFor(() => main.cameraFrameCount > 0, 3000, "first camera frame")
    const n0 = main.cameraFrameCount
    await sleep(1000)
    const n1 = main.cameraFrameCount
    print(`[DC1] camera frames in 1 s: ${n1 - n0}`)
    expect(n1 - n0 >= 5).toBe(true)
  }
}
