// Beauty Scan — UI module, Spectacles (2024) / Lens Studio 5.15 port. Owns every visible string
// in the Lens (Spanish).
//
// The hackathon build uses SpectaclesUIKit (FlexLayout / BackPlate / Button). The UIKit version
// that installs in Lens Studio 5.15 does not have the same Flex API, so this port only depends on
// Spectacles Interaction Kit: plates are tinted rounded-rect Images, buttons are Image + Text +
// box collider + SIK Interactable, and layout is fixed positions (cm).
//
// Surfaces (each its own root, placed in world space by the main script):
//   • ScanRoot   — prompt pill (hint / "Leyendo el producto…" / error message), scan frame
//                  (~10 cm) that pulses while scanning, big ESCANEAR button.
//   • ResultCard — 15 × 22 cm plate: name, brand · barcode, colored score circle + verdict,
//                  tagged problem ingredients with risk dots, sensitive-skin explanation,
//                  "Alternativa mejor:", data source, disclaimer, CERRAR.
//
// Main → UI: placeScan / showScanFrame / hideScanFrame / setScanning / showMessage / clearMessage /
//            showResult / hideResult / isResultVisible
// UI → Main: onScan, onTypeCode, onClose (Event<void>), onLanguage, onCardGrab

import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractableManipulation} from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"
import {Lang, LANGS, STRINGS, Strings} from "./BeautyScanI18n"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
// UIKit's own flat Image material (compiled with the package for this Lens Studio version).
import {IMAGE_MATERIAL_ASSET} from "SpectaclesUIKit.lspkg/Scripts/Utility/Assets"

// ── Type scale ───────────────────────────────────────────────────────────────────
type TextRole =
  | "Title1" | "HeadlineXL" | "Headline1" | "Headline2"
  | "Subheadline" | "Callout" | "Body" | "Caption"
const TYPE_SCALE: Record<TextRole, number> = {
  Title1: 105, HeadlineXL: 62, Headline1: 54, Headline2: 48,
  Subheadline: 41, Callout: 39, Body: 39, Caption: 38,
}
function roleSize(role: TextRole, distanceCm: number): number {
  return TYPE_SCALE[role] * (distanceCm / 110)
}

// ── Assets ───────────────────────────────────────────────────────────────────────
const ICON_SCAN = requireAsset("../Icons/barcode_scanner_256x256.png") as Texture
const ICON_CLOSE = requireAsset("../Icons/close_256x256.png") as Texture
const ICON_WARNING = requireAsset("../Icons/warning_256x256.png") as Texture
const ICON_SPA = requireAsset("../Icons/spa_256x256.png") as Texture
const ICON_INFO = requireAsset("../Icons/info_256x256.png") as Texture
const ICON_FRAME = requireAsset("../Icons/scan_frame_512x512.png") as Texture
const ICON_CIRCLE = requireAsset("../Icons/circle_256x256.png") as Texture
const PLATE_CARD = requireAsset("../Icons/plate_card_300x440.png") as Texture
const PLATE_PILL = requireAsset("../Icons/plate_pill_512x128.png") as Texture
// InciSee brand (start screen): logo, panel with violet border, idle / active pill buttons.
const BRAND_LOGO = requireAsset("../Icons/incisee_logo_1024x341.png") as Texture
const BRAND_PANEL = requireAsset("../Icons/incisee_panel_600x940.png") as Texture
const BRAND_BTN_IDLE = requireAsset("../Icons/incisee_btn_idle_600x128.png") as Texture
const BRAND_BTN_ACTIVE = requireAsset("../Icons/incisee_btn_active_600x128.png") as Texture
const BRAND_LOGO_ASPECT = 341 / 1024
const BRAND_LOGO_VERTICAL = requireAsset("../Icons/incisee_logo_vertical_640x640.png") as Texture // square
const BRAND_ICON = requireAsset("../Icons/incisee_icon_512x512.png") as Texture
const BRAND_RING = requireAsset("../Icons/incisee_ring_256x256.png") as Texture
const BRAND_ALTBOX = requireAsset("../Icons/incisee_altbox_512x80.png") as Texture
const BRAND_TAG = requireAsset("../Icons/incisee_tag_256x64.png") as Texture
const BRAND_LINE = requireAsset("../Icons/incisee_line_8x8.png") as Texture
const BRAND_FRAME = requireAsset("../Icons/incisee_frame_512x512.png") as Texture
const BRAND_SCANLINE = requireAsset("../Icons/incisee_scanline_512x32.png") as Texture
// Scan-screen pills drawn at the exact aspect of their quads, so the round ends don't stretch.
const PILL_SCAN = requireAsset("../Icons/incisee_pill_scan_692x200.png") as Texture
const PILL_CODE = requireAsset("../Icons/incisee_pill_code_500x200.png") as Texture
const PILL_CODE_HOT = requireAsset("../Icons/incisee_pill_code_hot_500x200.png") as Texture
const PILL_PROMPT = requireAsset("../Icons/incisee_pill_prompt_1230x200.png") as Texture
// Faux-bold: a thin outline in the text's own colour thickens every glyph (no bold font asset).
const BOLD_OUTLINE = 0.08

// ── Sizes (cm) ───────────────────────────────────────────────────────────────────
const SCAN_DIST = 40
const CARD_DIST = 45
const FRAME_SIZE = 10
const PROMPT_W = 16
const PROMPT_H = 2.6
const SCAN_BTN_W = 9
const SCAN_BTN_H = 2.6
const CODE_BTN_W = 6.5
const BTN_GAP = 0.6
const CARD_W = 15
const CARD_H = 23.6
const PAD = 0.6
const INNER_W = CARD_W - PAD * 2
const LEFT = -CARD_W / 2 + PAD
const RIGHT = CARD_W / 2 - PAD
const MAX_ROWS = 5
const ROW_H = 0.85
const CLOSE_W = 7.5
const CLOSE_H = 2.2
const CIRCLE = 3.3
const Z_CONTENT = 0.1
const Z_LABEL = 0.2

const WHITE = new vec4(1, 1, 1, 1)
// Spectacles is an additive display: translucent / dark colours read as grey or vanish, so the
// secondary text stays bright and fully opaque.
const SUBTLE = new vec4(0.85, 0.88, 0.92, 1)
const FAINT = new vec4(0.72, 0.75, 0.8, 1)
const DARK = new vec4(0.07, 0.07, 0.07, 1)
const WARN = new vec4(1, 0.6, 0.45, 1)
const PLATE = new vec4(0.1, 0.11, 0.13, 0.88)
const BTN = new vec4(0.22, 0.24, 0.3, 0.95)
const BTN_HOVER = new vec4(0.33, 0.42, 0.62, 1)
// InciSee palette
const LILAC = new vec4(0.773, 0.545, 1, 1) // #C58BFF
const MINT = new vec4(0.322, 0.898, 0.753, 1) // #52E5C0
const SAFE_GREEN = new vec4(0.07, 0.78, 0.48, 1) // #12C77B
const ORANGE = new vec4(1, 0.604, 0.22, 1) // #FF9A38
const MUTED = new vec4(0.741, 0.722, 0.824, 1) // #BDB8D2
const DIVIDER = new vec4(0.502, 0.392, 0.714, 0.7) // #8064B6

export type ProblemTagView = "heavy_metal" | "allergen" | "irritant" | "endocrine_disruptor"
const TAG_COLORS: Record<ProblemTagView, vec4> = {
  heavy_metal: new vec4(1, 0.72, 0.35, 1),
  allergen: new vec4(1, 0.6, 0.78, 1),
  irritant: new vec4(0.55, 0.85, 1, 1),
  endocrine_disruptor: new vec4(0.8, 0.65, 1, 1),
}
const RISK_COLORS: {[risk: string]: vec4} = {
  high: new vec4(0.95, 0.3, 0.25, 1),
  medium: new vec4(1, 0.6, 0.2, 1),
  low: new vec4(1, 0.88, 0.3, 1),
}

const PICKER_W = 14
const PICKER_BTN_W = 11
const PICKER_BTN_H = 2.4
const PICKER_GAP = 0.6
const PICKER_LOGO_W = 6.5 // vertical (square) logo on the start screen

export interface ResultIngredientView {
  name: string
  tag: ProblemTagView
  risk: string // high | medium | low
}
export interface ResultView {
  name: string
  subtitle: string // brand · barcode
  score: number
  scoreColor: vec4
  verdict: string
  problems: ResultIngredientView[]
  sensitiveSkin: string
  alternative: string // "" → hidden
  source: string
}

@component
export class BeautyScanUI extends BaseScriptComponent {
  // Flat "Image" material from SpectaclesUIKit — cloned for every image.
  private imageMaterial: Material = IMAGE_MATERIAL_ASSET
  private imageBroken = false
  // Every visual gets an explicit, increasing render order (creation order = back to front) and
  // no depth test, so text never hides behind its own plate.
  private nextOrder = 100
  private S: Strings = STRINGS.es

  // ── Events (UI → main) ─────────────────────────────────────────────────────────
  private _onScan = new Event<void>()
  get onScan(): PublicApi<void> {
    return this._onScan.publicApi()
  }
  /** "CÓDIGO" button: the user wants to type the barcode by hand. */
  private _onTypeCode = new Event<void>()
  get onTypeCode(): PublicApi<void> {
    return this._onTypeCode.publicApi()
  }
  private _onClose = new Event<void>()
  get onClose(): PublicApi<void> {
    return this._onClose.publicApi()
  }
  private _onLanguage = new Event<Lang>()
  get onLanguage(): PublicApi<Lang> {
    return this._onLanguage.publicApi()
  }
  /** Fired when the user grabs the result card (pinch-drag): the main script stops auto-follow. */
  private _onCardGrab = new Event<void>()
  get onCardGrab(): PublicApi<void> {
    return this._onCardGrab.publicApi()
  }

  // ── Roots / state ──────────────────────────────────────────────────────────────
  private scanRoot!: SceneObject
  private cardRoot!: SceneObject
  private pickerRoot!: SceneObject
  private cardGrabbed = false
  private hoveredButtons = 0
  private scanLabel!: Text
  private codeLabel!: Text
  private codeButtonSo!: SceneObject
  private closeLabel!: Text
  private sensitiveHeaderText!: Text
  private disclaimerText!: Text
  private wantScanVisible = true
  private wantCardVisible = false
  private scanning = false
  private pulseT = 0
  private messageTimer: DelayedCallbackEvent | null = null

  // ── Scan surface ───────────────────────────────────────────────────────────────
  private promptText!: Text
  private frameImageSo!: SceneObject
  private frameMat: Material | null = null
  private scanLineSo: SceneObject | null = null
  private scanButtonSo!: SceneObject

  // ── Card fields ────────────────────────────────────────────────────────────────
  private nameText!: Text
  private subtitleText!: Text
  private scoreText!: Text
  private circleMat: Material | null = null
  private verdictText!: Text
  private scoreCaption!: Text
  private problemsHeader!: Text
  private rowNames: Text[] = []
  private rowTags: Text[] = []
  private rowDotMats: (Material | null)[] = []
  private rowDotSos: SceneObject[] = []
  private rowTagPills: SceneObject[] = []
  private altBoxSo!: SceneObject
  private sensitiveText!: Text
  private altText!: Text
  private sourceText!: Text

  onAwake() {
    if (!this.imageMaterial) print("[BeautyScanUI] WARNING: imageMaterial not set — plates and icons are hidden")
    this.scanRoot = this.buildScanSurface()
    this.cardRoot = this.buildCard()
    this.pickerRoot = this.buildLanguagePicker()
    this.scanRoot.enabled = this.wantScanVisible
    this.cardRoot.enabled = this.wantCardVisible
    this.pickerRoot.enabled = false
    this.createEvent("UpdateEvent").bind(() => this.updatePulse())
  }

  // ── Public API (main → UI) ─────────────────────────────────────────────────────
  placeScan(worldPos: vec3, worldRot: quat): void {
    this.place(this.scanRoot, worldPos, worldRot)
  }

  /** Move the (visible) result card — used by the main script's follow behaviour. */
  placeCard(worldPos: vec3, worldRot: quat): void {
    this.place(this.cardRoot, worldPos, worldRot)
  }

  /** Current card pose (after the user moved it by hand). */
  getCardPosition(): vec3 {
    return this.cardRoot.getTransform().getWorldPosition()
  }

  /** Only rotate the card (keep the position the user dragged it to). */
  rotateCard(worldRot: quat): void {
    this.cardRoot.getTransform().setWorldRotation(worldRot)
  }

  /** True while a hand ray / finger is on one of our buttons (a pinch there is a button press). */
  isPointingAtButton(): boolean {
    return this.hoveredButtons > 0
  }

  isCardGrabbed(): boolean {
    return this.cardGrabbed
  }

  // ── Language ───────────────────────────────────────────────────────────────────
  placePicker(worldPos: vec3, worldRot: quat): void {
    this.place(this.pickerRoot, worldPos, worldRot)
  }

  showPicker(): void {
    this.pickerRoot.enabled = true
  }

  hidePicker(): void {
    this.hoveredButtons = 0
    this.pickerRoot.enabled = false
  }

  isPickerVisible(): boolean {
    return this.pickerRoot.enabled
  }

  /** Re-label every fixed string in the chosen language. */
  setLanguage(lang: Lang): void {
    this.S = STRINGS[lang]
    this.scanLabel.text = this.S.scan
    this.codeLabel.text = this.S.typeCode
    this.closeLabel.text = this.S.close
    this.sensitiveHeaderText.text = this.S.sensitiveHeader
    this.disclaimerText.text = this.S.disclaimer
    if (!this.scanning) this.promptText.text = this.S.promptHint
  }

  get strings(): Strings {
    return this.S
  }

  showScanFrame(): void {
    this.wantScanVisible = true
    this.scanRoot.enabled = true
  }

  hideScanFrame(): void {
    this.wantScanVisible = false
    this.hoveredButtons = 0
    this.scanRoot.enabled = false
  }

  isScanFrameVisible(): boolean {
    return this.wantScanVisible
  }

  /** While scanning: frame pulses, prompt reads "Leyendo el producto…", SCAN button hidden. */
  setScanning(on: boolean): void {
    this.scanning = on
    this.cancelMessageTimer()
    this.promptText.text = on ? this.S.promptReading : this.S.promptHint
    this.tint(this.promptText, WHITE)
    this.scanButtonSo.enabled = !on
    this.codeButtonSo.enabled = !on
    if (on) this.hoveredButtons = 0
    if (!on) this.resetPulse()
  }

  /** Short error message in the prompt pill; reverts to the hint after `seconds`. */
  showMessage(text: string, seconds: number = 5): void {
    this.cancelMessageTimer()
    this.promptText.text = text
    this.tint(this.promptText, WARN)
    const t = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    t.bind(() => this.clearMessage())
    t.reset(seconds)
    this.messageTimer = t
  }

  /** Neutral prompt text that stays until changed (keyboard preview, "Ampliando el código…"). */
  setPrompt(text: string): void {
    this.cancelMessageTimer()
    this.promptText.text = text
    this.tint(this.promptText, WHITE)
  }

  /** Hide / show both buttons (e.g. while the keyboard is open). */
  setButtonsVisible(on: boolean): void {
    this.scanButtonSo.enabled = on
    this.codeButtonSo.enabled = on
    if (!on) this.hoveredButtons = 0
  }

  clearMessage(): void {
    this.cancelMessageTimer()
    if (this.scanning) return
    this.promptText.text = this.S.promptHint
    this.tint(this.promptText, WHITE)
  }

  getPromptText(): string {
    return this.promptText ? this.promptText.text : ""
  }

  showResult(view: ResultView, worldPos: vec3, worldRot: quat): void {
    this.nameText.text = view.name
    this.subtitleText.text = view.subtitle
    this.scoreText.text = String(Math.round(view.score))
    // Ring in the score colour, number in white (InciSee look).
    if (this.circleMat) this.circleMat.mainPass.baseColor = view.scoreColor
    this.tint(this.scoreText, this.circleMat ? WHITE : view.scoreColor)
    this.verdictText.text = view.verdict
    this.tint(this.verdictText, view.scoreColor)
    this.scoreCaption.text = this.S.score(Math.round(view.score))
    this.problemsHeader.text = view.problems.length > 0 ? this.S.problems(view.problems.length) : this.S.noProblems
    for (let i = 0; i < MAX_ROWS; i++) {
      const p = i < view.problems.length ? view.problems[i] : undefined
      const nameT = this.rowNames[i]
      const tagT = this.rowTags[i]
      const dotSo = this.rowDotSos[i]
      const dotMat = this.rowDotMats[i]
      if (nameT) nameT.text = p ? p.name : ""
      if (tagT) {
        tagT.text = p ? this.S.tag[p.tag] : ""
        this.tint(tagT, p ? TAG_COLORS[p.tag] : WHITE)
      }
      if (dotMat) dotMat.mainPass.baseColor = p ? RISK_COLORS[p.risk] || WHITE : WHITE
      if (dotSo) dotSo.enabled = !!p
      if (this.rowTagPills[i]) this.rowTagPills[i].enabled = !!p
    }
    this.sensitiveText.text = view.sensitiveSkin
    this.altText.text = view.alternative ? this.S.alternative(view.alternative) : ""
    if (this.altBoxSo) this.altBoxSo.enabled = !!view.alternative
    this.sourceText.text = view.source
    this.place(this.cardRoot, worldPos, worldRot)
    this.cardGrabbed = false
    this.wantCardVisible = true
    this.cardRoot.enabled = true
  }

  hideResult(): void {
    this.hoveredButtons = 0
    this.wantCardVisible = false
    this.cardRoot.enabled = false
  }

  isResultVisible(): boolean {
    return this.wantCardVisible
  }

  // ── Pulse ──────────────────────────────────────────────────────────────────────
  private updatePulse(): void {
    if (!this.scanning || !this.frameImageSo) return
    this.pulseT += getDeltaTime()
    const k = 0.5 + 0.5 * Math.sin(this.pulseT * Math.PI * 2 * 1.4)
    const s = FRAME_SIZE * (1 + 0.04 * k)
    this.frameImageSo.getTransform().setLocalScale(new vec3(s, s, 1))
    if (this.frameMat) this.frameMat.mainPass.baseColor = new vec4(1, 1, 1, 0.65 + 0.35 * k)
    if (this.scanLineSo) {
      this.scanLineSo.enabled = true
      const sweep = Math.sin(this.pulseT * Math.PI * 0.9) * FRAME_SIZE * 0.4
      this.scanLineSo.getTransform().setLocalPosition(new vec3(0, sweep, 0.05))
    }
  }

  private resetPulse(): void {
    this.pulseT = 0
    if (!this.frameImageSo) return
    this.frameImageSo.getTransform().setLocalScale(new vec3(FRAME_SIZE, FRAME_SIZE, 1))
    if (this.frameMat) this.frameMat.mainPass.baseColor = WHITE
    if (this.scanLineSo) this.scanLineSo.enabled = false
  }

  private cancelMessageTimer(): void {
    if (this.messageTimer) {
      this.removeEvent(this.messageTimer)
      this.messageTimer = null
    }
  }

  // ── Builders ───────────────────────────────────────────────────────────────────
  private buildScanSurface(): SceneObject {
    const root = this.obj(this.sceneObject, "ScanRoot")

    // Prompt pill (top).
    const pillY = FRAME_SIZE / 2 + 0.8 + PROMPT_H / 2
    const pill = this.obj(root, "ScanPrompt", new vec3(0, pillY, 0))
    this.image(pill, "ScanPromptPlate", PILL_PROMPT, PROMPT_W, PROMPT_H, WHITE, 0)
    // Small InciSee logo above the prompt.
    const logoW = 6.5
    const logoH = logoW * BRAND_LOGO_ASPECT
    this.image(root, "ScanLogo", BRAND_LOGO, logoW, logoH, WHITE, 0, new vec3(0, pillY + PROMPT_H / 2 + 0.5 + logoH / 2, 0))
    this.promptText = this.text(pill, "ScanPromptText", this.S.promptHint, "Subheadline", SCAN_DIST, 0, 0, PROMPT_W - 1, PROMPT_H, HorizontalAlignment.Center, true)

    // Scan frame (centre).
    const fr = this.image(root, "ScanFrameImage", BRAND_FRAME, FRAME_SIZE, FRAME_SIZE, WHITE, 0)
    this.frameImageSo = fr.so
    this.frameMat = fr.mat
    // Lilac scan line: sweeps up and down inside the frame while reading.
    this.scanLineSo = this.image(root, "ScanLine", BRAND_SCANLINE, FRAME_SIZE * 0.86, 0.55, WHITE, 0).so
    this.scanLineSo.enabled = false

    // ESCANEAR + CÓDIGO buttons (bottom row; side by side so both stay inside the 2024 FOV).
    const btnY = -(FRAME_SIZE / 2 + 0.8 + SCAN_BTN_H / 2)
    const rowW = SCAN_BTN_W + BTN_GAP + CODE_BTN_W
    const scanX = -rowW / 2 + SCAN_BTN_W / 2
    const codeX = rowW / 2 - CODE_BTN_W / 2
    const scanBtn = this.button(root, "ScanButton", new vec3(scanX, btnY, 0), SCAN_BTN_W, SCAN_BTN_H, this.S.scan, "Headline2", SCAN_DIST, ICON_SCAN, 1.7, () =>
      this._onScan.invoke(), {idle: PILL_SCAN, hot: PILL_SCAN}
    )
    this.scanButtonSo = scanBtn.so
    this.scanLabel = scanBtn.label
    const codeBtn = this.button(root, "CodeButton", new vec3(codeX, btnY, 0), CODE_BTN_W, SCAN_BTN_H, this.S.typeCode, "Headline2", SCAN_DIST, null, 0, () =>
      this._onTypeCode.invoke(), {idle: PILL_CODE, hot: PILL_CODE_HOT}
    )
    this.codeButtonSo = codeBtn.so
    this.codeLabel = codeBtn.label
    return root
  }

  private buildCard(): SceneObject {
    const root = this.obj(this.sceneObject, "ResultCard")
    // InciSee panel: dark fill + violet border (texture colours, no tint).
    this.image(root, "CardPlate", BRAND_PANEL, CARD_W, CARD_H, WHITE, 0)
    const c = this.obj(root, "Content", new vec3(0, 0, Z_CONTENT))
    const L = HorizontalAlignment.Left
    const midX = (LEFT + RIGHT) / 2
    let y = CARD_H / 2 - PAD - 0.2

    // Header: brand icon tile + name + brand · barcode
    const tile = 2.6
    const hy = y - tile / 2
    this.image(c, "CardIcon", BRAND_ICON, tile, tile, WHITE, 0, new vec3(LEFT + tile / 2, hy, 0))
    const tx = LEFT + tile + 0.6
    const tw = RIGHT - tx
    this.nameText = this.text(c, "CardName", "Producto", "Headline2", CARD_DIST, tx + tw / 2, hy + 0.55, tw, 1.3, L)
    this.subtitleText = this.text(c, "CardSubtitle", "", "Caption", CARD_DIST, tx + tw / 2, hy - 0.65, tw, 0.8, L)
    this.tint(this.subtitleText, MUTED)
    y -= tile + 0.3
    this.divider(c, y)
    y -= 0.3

    // Score row: ring in the score colour with the number + verdict column
    const rowY = y - CIRCLE / 2
    const cx = LEFT + CIRCLE / 2
    const ring = this.image(c, "ScoreRing", BRAND_RING, CIRCLE, CIRCLE, WHITE, 0, new vec3(cx, rowY, 0))
    this.circleMat = ring.mat
    this.scoreText = this.text(c, "ScoreNumber", "100", "Title1", CARD_DIST, cx, rowY, CIRCLE * 0.8, CIRCLE * 0.8, HorizontalAlignment.Center)
    this.scoreText.size = roleSize("Title1", CARD_DIST) * 0.8
    const vLeft = LEFT + CIRCLE + 0.8
    const vW = RIGHT - vLeft
    this.verdictText = this.text(c, "VerdictText", "Excelente", "HeadlineXL", CARD_DIST, vLeft + vW / 2, rowY + 0.5, vW, 1.6, L)
    this.scoreCaption = this.text(c, "ScoreCaption", "Puntaje 100/100", "Caption", CARD_DIST, vLeft + vW / 2, rowY - 0.8, vW, 0.8, L)
    this.tint(this.scoreCaption, MUTED)
    y -= CIRCLE + 0.3
    this.divider(c, y)
    y -= 0.3

    // Problem ingredients header
    y -= 0.5
    this.image(c, "WarningIcon", ICON_WARNING, 0.9, 0.9, ORANGE, 0, new vec3(LEFT + 0.45, y, 0))
    this.problemsHeader = this.text(c, "ProblemsHeaderText", "Ingredientes problemáticos", "Subheadline", CARD_DIST, LEFT + 1.3 + (INNER_W - 1.3) / 2, y, INNER_W - 1.3, 1.0, L)
    y -= 0.5 + 0.1

    // Ingredient rows: risk dot + name (left) + tag pill (right)
    for (let i = 0; i < MAX_ROWS; i++) {
      const ry = y - ROW_H / 2
      const dot = this.image(c, "RiskDot" + i, ICON_CIRCLE, 0.45, 0.45, WHITE, 0, new vec3(LEFT + 0.25, ry, 0))
      this.rowDotSos.push(dot.so)
      this.rowDotMats.push(dot.mat)
      const nameW = 8.4
      this.rowNames.push(this.text(c, "IngredientName" + i, "", "Caption", CARD_DIST, LEFT + 0.8 + nameW / 2, ry, nameW, ROW_H, L))
      const tagW = 4.3
      const pill = this.image(c, "IngredientTagPill" + i, BRAND_TAG, tagW, ROW_H * 0.82, WHITE, 0, new vec3(RIGHT - tagW / 2, ry, 0))
      this.rowTagPills.push(pill.so)
      this.rowTags.push(this.text(c, "IngredientTag" + i, "", "Callout", CARD_DIST, RIGHT - tagW / 2, ry, tagW - 0.4, ROW_H, HorizontalAlignment.Center))
      y -= ROW_H
    }

    // Sensitive skin
    y -= 0.5
    this.image(c, "SpaIcon", ICON_SPA, 0.9, 0.9, MINT, 0, new vec3(LEFT + 0.45, y, 0))
    this.sensitiveHeaderText = this.text(c, "SensitiveHeaderText", this.S.sensitiveHeader, "Subheadline", CARD_DIST, LEFT + 1.3 + (INNER_W - 1.3) / 2, y, INNER_W - 1.3, 1.0, L)
    this.tint(this.sensitiveHeaderText, MINT)
    y -= 0.5 + 0.1 + 1.0
    this.sensitiveText = this.text(c, "SensitiveText", "", "Caption", CARD_DIST, midX, y, INNER_W, 2.0, L, true)
    y -= 1.0 + 0.3

    // Recommended alternative (only when score < 50): green box with a leaf
    const altH = 1.9
    const ay = y - altH / 2
    const box = this.obj(c, "AlternativeBox", new vec3(0, 0, 0))
    this.altBoxSo = box
    this.image(box, "AlternativePlate", BRAND_ALTBOX, INNER_W, altH, WHITE, 0, new vec3(midX, ay, 0))
    this.image(box, "AlternativeIcon", ICON_SPA, 1.0, 1.0, SAFE_GREEN, 0, new vec3(LEFT + 0.9, ay, 0))
    this.altText = this.text(box, "AlternativeText", "", "Callout", CARD_DIST, LEFT + 1.8 + (INNER_W - 2.2) / 2, ay, INNER_W - 2.2, altH - 0.2, L, true)
    this.tint(this.altText, MINT)
    box.enabled = false
    y -= altH + 0.3
    this.divider(c, y)
    y -= 0.5

    // Source
    this.image(c, "InfoIcon", ICON_INFO, 0.7, 0.7, LILAC, 0, new vec3(LEFT + 0.35, y, 0))
    this.sourceText = this.text(c, "SourceText", "", "Caption", CARD_DIST, LEFT + 1.0 + (INNER_W - 1.0) / 2, y, INNER_W - 1.0, 0.8, L)
    this.sourceText.size = roleSize("Caption", CARD_DIST) * 0.9
    y -= 0.8

    // Disclaimer
    const dt = this.text(c, "DisclaimerText", this.S.disclaimer, "Caption", CARD_DIST, midX, y, INNER_W, 0.8, L)
    this.tint(dt, FAINT)
    dt.size = roleSize("Caption", CARD_DIST) * 0.85
    this.disclaimerText = dt

    // CERRAR button (bottom centre)
    const closeY = -CARD_H / 2 + PAD + CLOSE_H / 2
    const closeBtn = this.button(
      c,
      "CloseButton",
      new vec3(0, closeY, 0),
      CLOSE_W,
      CLOSE_H,
      this.S.close,
      "Callout",
      CARD_DIST,
      ICON_CLOSE,
      1.1,
      () => this._onClose.invoke(),
      {idle: BRAND_BTN_IDLE, hot: BRAND_BTN_ACTIVE}
    )
    this.closeLabel = closeBtn.label

    // Grab the card anywhere (pinch-drag) to move it — closer, farther, left/right. Rotation and
    // scale stay locked; the main script keeps it facing the user. The CERRAR button's collider sits
    // in front of the card's, so pinching CERRAR still closes it.
    const cardCollider = root.createComponent("Physics.ColliderComponent") as ColliderComponent
    const cardShape = Shape.createBoxShape()
    cardShape.size = new vec3(CARD_W, CARD_H, 0.4)
    cardCollider.shape = cardShape
    cardCollider.fitVisual = false
    root.createComponent(Interactable.getTypeName())
    const manip = root.createComponent(InteractableManipulation.getTypeName()) as InteractableManipulation
    manip.setCanRotate(false)
    manip.setCanScale(false)
    manip.onManipulationStart.add(() => {
      this.cardGrabbed = true
      this._onCardGrab.invoke()
    })
    return root
  }

  /** First screen (InciSee brand): logo, title, one pill button per language. */
  private buildLanguagePicker(): SceneObject {
    const root = this.obj(this.sceneObject, "LanguagePicker")
    const n = LANGS.length
    const titleH = 2.2
    const logoH = PICKER_LOGO_W
    const h = PAD * 3 + logoH + PICKER_GAP + titleH + n * PICKER_BTN_H + n * PICKER_GAP
    // The panel texture carries its own colours (dark fill + violet border): no tint.
    this.image(root, "PickerPlate", BRAND_PANEL, PICKER_W, h, WHITE, 0)
    const c = this.obj(root, "Content", new vec3(0, 0, Z_CONTENT))
    let y = h / 2 - PAD * 2 - logoH / 2
    this.image(c, "PickerLogo", BRAND_LOGO_VERTICAL, PICKER_LOGO_W, logoH, WHITE, 0.05, new vec3(0, y, 0))
    y -= logoH / 2 + PICKER_GAP + titleH / 2
    // Every language's own name is on its button, so the title is bilingual.
    this.text(c, "PickerTitle", STRINGS.es.pickTitle, "Subheadline", SCAN_DIST, 0, y, PICKER_W - 1, titleH, HorizontalAlignment.Center, true)
    y -= titleH / 2 + PICKER_GAP
    for (const lang of LANGS) {
      y -= PICKER_BTN_H / 2
      this.button(
        c,
        "Lang_" + lang,
        new vec3(0, y, 0),
        PICKER_BTN_W,
        PICKER_BTN_H,
        STRINGS[lang].langName,
        "Headline2",
        SCAN_DIST,
        null,
        0,
        () => this._onLanguage.invoke(lang),
        {idle: BRAND_BTN_IDLE, hot: BRAND_BTN_ACTIVE}
      )
      y -= PICKER_BTN_H / 2 + PICKER_GAP
    }
    return root
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────
  /** Thin violet line across the card at height y. */
  private divider(parent: SceneObject, y: number): void {
    this.image(parent, "Divider", BRAND_LINE, INNER_W, 0.05, DIVIDER, 0, new vec3((LEFT + RIGHT) / 2, y, 0))
  }

  private obj(parent: SceneObject, name: string, position?: vec3): SceneObject {
    const so = global.scene.createSceneObject(name)
    so.setParent(parent)
    if (position) so.getTransform().setLocalPosition(position)
    return so
  }

  private place(so: SceneObject, pos: vec3, rot: quat): void {
    const t = so.getTransform()
    t.setWorldPosition(pos)
    t.setWorldRotation(rot)
  }

  /** World-space Text centred at (x, y) inside a width × height box. */
  private text(
    parent: SceneObject,
    name: string,
    value: string,
    role: TextRole,
    distanceCm: number,
    x: number,
    y: number,
    width: number,
    height: number,
    align: HorizontalAlignment,
    wrap: boolean = false
  ): Text {
    const so = this.obj(parent, name, new vec3(x, y, Z_LABEL))
    const t = so.createComponent("Component.Text") as Text
    t.text = value
    t.depthTest = false
    t.setRenderOrder(this.nextOrder++)
    t.size = roleSize(role, distanceCm)
    t.horizontalAlignment = align
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = wrap ? HorizontalOverflow.Wrap : HorizontalOverflow.Shrink
    t.verticalOverflow = wrap ? VerticalOverflow.Shrink : VerticalOverflow.Overflow
    t.worldSpaceRect = Rect.create(-width / 2, width / 2, -height / 2, height / 2)
    t.outlineSettings.enabled = true
    t.outlineSettings.size = BOLD_OUTLINE
    this.tint(t, WHITE)
    return t
  }

  /** Text colour + matching bold outline. */
  private tint(t: Text, color: vec4): void {
    t.textFill.color = color
    t.outlineSettings.fill.color = color
  }

  /** Tinted textured quad, width × height cm. Returns null material when no imageMaterial is set. */
  private image(
    parent: SceneObject,
    name: string,
    tex: Texture,
    width: number,
    height: number,
    color: vec4,
    z: number,
    position?: vec3
  ): {so: SceneObject; mat: Material | null} {
    const p = position ? new vec3(position.x, position.y, z) : new vec3(0, 0, z)
    const so = this.obj(parent, name, p)
    so.getTransform().setLocalScale(new vec3(width, height, 1))
    if (!this.imageMaterial || this.imageBroken) return {so, mat: null}
    let mat: Material
    try {
      mat = this.imageMaterial.clone()
      mat.mainPass.baseTex = tex
      mat.mainPass.baseColor = color
      mat.mainPass.depthTest = false
      mat.mainPass.depthWrite = false
    } catch (e) {
      this.imageBroken = true
      print("[BeautyScanUI] WARNING: image material unusable, falling back to text-only UI: " + e)
      return {so, mat: null}
    }
    const img = so.createComponent("Component.Image") as Image
    img.setRenderOrder(this.nextOrder++)
    img.clearMaterials()
    img.addMaterial(mat)
    return {so, mat}
  }

  /** Plate + icon + label + box collider + SIK Interactable (pinch or poke triggers onPress). */
  private button(
    parent: SceneObject,
    name: string,
    position: vec3,
    w: number,
    h: number,
    label: string,
    role: TextRole,
    distanceCm: number,
    icon: Texture | null,
    iconSize: number,
    onPress: () => void,
    skin?: {idle: Texture; hot: Texture} // textured pill (brand) instead of a tinted plate
  ): {so: SceneObject; label: Text} {
    const so = this.obj(parent, name, position)
    const plate = this.image(so, name + "Plate", skin ? skin.idle : PLATE_PILL, w, h, skin ? WHITE : BTN, 0.05)
    let labelText: Text
    if (icon) {
      const labelW = w - iconSize - 1.2
      const groupW = iconSize + 0.4 + labelW
      const iconX = -groupW / 2 + iconSize / 2
      this.image(so, name + "Icon", icon, iconSize, iconSize, WHITE, 0.15, new vec3(iconX, 0, 0))
      labelText = this.text(so, name + "Label", label, role, distanceCm, iconX + iconSize / 2 + 0.4 + labelW / 2, 0, labelW, h, HorizontalAlignment.Center)
    } else {
      labelText = this.text(so, name + "Label", label, role, distanceCm, 0, 0, w - 1, h, HorizontalAlignment.Center)
    }

    const collider = so.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createBoxShape()
    shape.size = new vec3(w, h, 1.5)
    collider.shape = shape
    collider.fitVisual = false

    const interactable = so.createComponent(Interactable.getTypeName()) as Interactable
    const setColor = (c: vec4) => {
      if (!plate.mat) return
      if (skin) {
        plate.mat.mainPass.baseTex = c === BTN_HOVER ? skin.hot : skin.idle
        const k = c === BTN_HOVER ? 1.05 : 1
        plate.so.getTransform().setLocalScale(new vec3(w * k, h * k, 1))
      } else plate.mat.mainPass.baseColor = c
    }
    let hovered = false
    interactable.onHoverEnter.add(() => {
      setColor(BTN_HOVER)
      if (!hovered) this.hoveredButtons++
      hovered = true
    })
    interactable.onHoverExit.add(() => {
      setColor(BTN)
      if (hovered) this.hoveredButtons = Math.max(0, this.hoveredButtons - 1)
      hovered = false
    })
    interactable.onTriggerEnd.add(() => {
      setColor(BTN)
      onPress()
    })
    return {so, label: labelText}
  }
}
