// DC2 — Pinching (or pressing SCAN) captures a camera frame, shows "Reading the product…",
// and sends it to the AI. Uses the LIVE camera frame (whatever the Preview feeds the camera).

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {STRINGS} from "../Scripts/BeautyScanI18n"
import {AI_WAIT_MS, BeautyScanTester, enabledInHierarchy, mainScript, textOf, waitFor} from "./BeautyScanTestKit"

@component
export class DC2_CaptureAndSend extends Scenario {
  async run(): Promise<void> {
    const it = new BeautyScanTester()
    await sleep(500)
    await it.reset()
    const main = mainScript()
    await waitFor(() => main.cameraFrameCount > 0, 3000, "camera frames")

    // A) ESCANEAR button.
    const before = main.scanCount
    await it.pressScan()
    await waitFor(() => main.scanCount === before + 1, 2000, "scan to start")
    expect(main.lastTrigger).toBe("button")
    expect(main.state).toBe("scanning")
    expect(textOf("ScanPromptText")).toBe(STRINGS.es.promptReading)
    expect(enabledInHierarchy("ScanButton")).toBe(false) // hidden while reading
    await waitFor(() => main.lastCapturedBytes > 0, 3000, "camera frame captured")
    expect(main.lastCaptureSource).toBe("camera")
    print(`[DC2] captured ${main.lastCapturedBytes} bytes from the camera`)
    await waitFor(() => main.state !== "scanning", AI_WAIT_MS, "AI answer")
    print(`[DC2] outcome=${main.lastOutcomeKind}; log:\n  ${main.lastLog.join("\n  ")}`)
    // The frame reached the AI and the AI answered (not a connection failure).
    expect(main.lastOutcomeKind === "result" || main.lastOutcomeKind === "unreadable").toBe(true)
    expect(main.lastLog.length > 0 && main.lastLog[0].indexOf("vision @") === 0).toBe(true)

    // B) Pinch path (same handler a real hand pinch calls).
    await it.reset()
    const b2 = main.scanCount
    main.simulatePinch()
    expect(main.scanCount).toBe(b2 + 1)
    expect(main.lastTrigger).toBe("pinch")
    expect(textOf("ScanPromptText")).toBe(STRINGS.es.promptReading)
    await waitFor(() => main.state !== "scanning", AI_WAIT_MS, "AI answer (pinch)")
    expect(main.lastOutcomeKind === "result" || main.lastOutcomeKind === "unreadable").toBe(true)

    // A pinch while a scan is running does not start a second one.
    await it.reset()
    const b3 = main.scanCount
    main.simulatePinch()
    main.simulatePinch()
    expect(main.scanCount).toBe(b3 + 1)
    await waitFor(() => main.state !== "scanning", AI_WAIT_MS, "AI answer (double pinch)")
  }
}
