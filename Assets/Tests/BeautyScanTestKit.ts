// LEAF helpers for Beauty Scan scenarios. Buttons are pressed through SIK (DefaultLeafInteractor).
// Product photos are fixture label images built from REAL Open Beauty Facts records
// (Pantene Pro-V Shampoo 4084500943827, NIVEA Control de brillo 4005900732583) plus a blank image;
// they are injected through BeautyScan.testFrameOverride instead of the live camera.

import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {findInteractableByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {BeautyScan} from "../Scripts/BeautyScan"

export const FIXTURE_PANTENE = requireAsset("./Fixtures/TestProduct_Pantene.png") as Texture
export const FIXTURE_NIVEA = requireAsset("./Fixtures/TestProduct_Nivea.png") as Texture
export const FIXTURE_BLANK = requireAsset("./Fixtures/TestBlank_NoProduct.png") as Texture

export const VALID_TAG_LABELS = ["Metal pesado", "Alérgeno", "Irritante", "Disruptor endocrino"]
export const AI_WAIT_MS = 45000

export function mainScript(): BeautyScan {
  const so = findSceneObjectByName("BeautyScan")
  if (!so) throw new Error('Scene object "BeautyScan" not found')
  const c = so.getComponent(BeautyScan.getTypeName()) as BeautyScan
  if (!c) throw new Error("BeautyScan script not found")
  return c
}

export function textOf(name: string): string {
  const so = findSceneObjectByName(name)
  if (!so) throw new Error(`Scene object "${name}" not found`)
  const t = so.getComponent("Component.Text") as Text
  if (!t) throw new Error(`"${name}" has no Text component`)
  return t.text
}

export function textColorOf(name: string): vec4 {
  const so = findSceneObjectByName(name)
  const t = so ? (so.getComponent("Component.Text") as Text) : null
  if (!t) throw new Error(`"${name}" has no Text component`)
  return t.textFill.color
}

export function enabledInHierarchy(name: string): boolean {
  const so = findSceneObjectByName(name)
  return !!so && so.isEnabledInHierarchy
}

export function worldPos(name: string): vec3 {
  const so = findSceneObjectByName(name)
  if (!so) throw new Error(`Scene object "${name}" not found`)
  return so.getTransform().getWorldPosition()
}

export function cameraTransform(): Transform {
  return WorldCameraFinderProvider.getInstance().getTransform()
}

/** Position of `name` in camera space: x right, y up, z = distance ahead (cm). */
export function inCameraSpace(name: string): vec3 {
  const cam = cameraTransform()
  const d = worldPos(name).sub(cam.getWorldPosition())
  const right = cam.right
  const up = cam.up
  const fwd = cam.forward.uniformScale(-1)
  return new vec3(d.dot(right), d.dot(up), d.dot(fwd))
}

export async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const start = getTime()
  while (!cond()) {
    if ((getTime() - start) * 1000 > timeoutMs) throw new Error(`Timed out after ${timeoutMs} ms waiting for: ${what}`)
    await sleep(50)
  }
}

export function sameColor(a: vec4, b: vec4): boolean {
  return Math.abs(a.x - b.x) < 0.02 && Math.abs(a.y - b.y) < 0.02 && Math.abs(a.z - b.z) < 0.02
}

export class BeautyScanTester extends DefaultLeafInteractor {
  async pressScan(): Promise<void> {
    await waitFor(() => enabledInHierarchy("ScanButton"), 3000, "ESCANEAR button visible")
    const btn = findInteractableByName("ScanButton")
    if (!btn) throw new Error('Interactable "ScanButton" not found')
    await this.trigger(btn)
  }

  async pressClose(): Promise<void> {
    await waitFor(() => enabledInHierarchy("CloseButton"), 3000, "CERRAR button visible")
    const btn = findInteractableByName("CloseButton")
    if (!btn) throw new Error('Interactable "CloseButton" not found')
    await this.trigger(btn)
    await sleep(250)
  }

  /** Back to the idle scan screen, waiting out any scan in flight. */
  async reset(): Promise<void> {
    const main = mainScript()
    // New first screen: language picker. Tests run in Spanish.
    if (main.state === "language") main.chooseLanguage("es")
    await waitFor(() => main.state !== "scanning", AI_WAIT_MS, "previous scan to finish")
    if (main.state === "result") await this.pressClose()
    main.testFrameOverride = null
    await waitFor(() => enabledInHierarchy("ScanButton"), 3000, "scan screen back")
  }

  /** Inject a fixture photo, press ESCANEAR and wait for the outcome. */
  async scanFixture(tex: Texture | null): Promise<string> {
    const main = mainScript()
    await this.reset()
    main.testFrameOverride = tex
    const before = main.scanCount
    await this.pressScan()
    await waitFor(() => main.scanCount === before + 1, 2000, "scan to start")
    await waitFor(() => main.state !== "scanning", AI_WAIT_MS, "AI answer")
    main.testFrameOverride = null
    await sleep(300)
    print(`[LEAF] outcome=${main.lastOutcomeKind}; log:\n  ${main.lastLog.join("\n  ")}`)
    return main.lastOutcomeKind
  }
}
