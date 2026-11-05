// Beauty Scan — main experience script.
// Flow: scan frame ~40 cm ahead + ESCANEAR button → pinch (either hand) or ESCANEAR captures the
// current camera frame → Gemini reads barcode / brand / name / ingredients → Open Beauty Facts by
// barcode → Gemini scores the ingredients → Yuka-style result card to the left of the product.
// CERRAR hides the card and brings the scan frame back. No product → "No pude leer el producto…";
// AI / network failure → "Sin conexión — probá de nuevo". The frame is only encoded when the user
// scans and is never stored.
//
// SPECS 27 / Lens Studio 5.23 build (ported from the Spectacles 2024 copy): the scene wires
// BeautyScanUI and RemoteServiceGatewayCredentials; InternetModule comes from require().


import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {HandInputData} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData"
import {BeautyScanUI, ResultView} from "./BeautyScanUI"
import {BeautyScanAudio} from "./BeautyScanAudio"
import {BeautyScanCamera, cropBarcode, encodeJpeg, tickEncodeTimeouts} from "./BeautyScanCamera"
import {Lang, STRINGS} from "./BeautyScanI18n"
import {runCode, runScan, ScanInput, ScanOutcome, ScanResult, scoreColor} from "./BeautyScanPipeline"

// Distances are chosen so each surface fits the Spectacles (2024) field of view (~25° vertical):
// scan surface ≈ 18 cm tall at 50 cm, result card 22 cm tall at 62 cm.
const SCAN_DISTANCE = 50 // cm — scan frame (follows the gaze, including looking down at the product)
const CARD_DISTANCE = 62 // cm — result card (follows the head, level with the eyes)
const CARD_DROP = 1
const FOLLOW_SPEED_SCAN = 7 // 1/s — smoothing toward the target pose
const FOLLOW_SPEED_CARD = 4
const CARD_DEADZONE_DEG = 12 // the card only re-centres once it is this far off the view centre

export type ScanState = "language" | "idle" | "typing" | "scanning" | "result"

@component
export class BeautyScan extends BaseScriptComponent {
  // SPECS 27 build: the scene wires the BeautyScanUI component; the Google token comes from the
  // scene's RemoteServiceGatewayCredentials.
  @input
  uiHud!: BeautyScanUI
  private internet: InternetModule = require("LensStudio:InternetModule")
  private camera = new BeautyScanCamera()
  private audio!: BeautyScanAudio
  private camTransform: Transform | null = null
  private token = 0
  // A scan never "thinks" forever: after this deadline the result is dropped and we say so.
  private scanDeadline = 0
  private static readonly SCAN_WATCHDOG_SEC = 60
  // While the AR keyboard is open (and just after), pinches are key presses, not scans.
  private pinchBlockedUntil = 0
  private keyboardOpenedAt = 0
  private scanPos: vec3 | null = null
  private scanRot: quat | null = null
  private cardPos: vec3 | null = null
  private cardRot: quat | null = null
  private cardFollowing = false

  // ── Read-only state for tests / debugging ─────────────────────────────────────
  public state: ScanState = "language"
  public lang: Lang = "es"
  public scanCount = 0
  public lastTrigger = "" // "pinch" | "button" | "test"
  public lastCapturedBytes = 0 // size of the JPEG sent to the AI (frame itself is not kept)
  public lastCaptureSource = "" // "camera" | "test-texture"
  public lastOutcomeKind = "" // "result" | "unreadable" | "offline"
  public lastResult: ScanResult | null = null
  public lastLog: string[] = []

  /** Test hook: when set, the next scans encode this texture instead of the live camera frame. */
  public testFrameOverride: Texture | null = null

  get cameraFrameCount(): number {
    return this.camera.frameCount
  }

  onAwake() {
    if (!this.uiHud) this.uiHud = this.sceneObject.createComponent(BeautyScanUI.getTypeName()) as BeautyScanUI
    this.audio = new BeautyScanAudio(this.sceneObject)
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("OnDestroyEvent").bind(() => this.camera.stop())
    this.createEvent("UpdateEvent").bind(() => {
      tickEncodeTimeouts()
      this.tickWatchdog()
      this.follow()
    })
  }

  private onStart() {
    this.camTransform = WorldCameraFinderProvider.getInstance().getTransform()
    this.camera.start(512, 756)

    this.uiHud.onScan.add(() => this.startScan("button"))
    this.uiHud.onTypeCode.add(() => this.openKeyboard())
    this.uiHud.onClose.add(() => this.closeResult())
    this.uiHud.onLanguage.add((l) => this.chooseLanguage(l))
    this.uiHud.onCardGrab.add(() => (this.cardFollowing = false))

    // Pinch with either hand scans (device). In the editor the ESCANEAR button does the same.
    const hands = HandInputData.getInstance()
    for (const h of ["left", "right"] as const) {
      // A pinch on one of our buttons is a button press, not a scan.
      hands.getHand(h).onPinchDown.add(() => {
        if (this.uiHud.isPointingAtButton() || getTime() < this.pinchBlockedUntil) return
        this.startScan("pinch")
      })
    }

    // First screen: language picker (it follows the gaze like the scan frame).
    this.uiHud.hideScanFrame()
    this.placeScanSurface()
    this.uiHud.showPicker()
    print("[BeautyScan] ready — camera requested, waiting for language choice")
  }

  /** Language picked on the first screen → localize the UI and show the scan frame. */
  chooseLanguage(l: Lang): void {
    if (this.state !== "language") return
    this.lang = l
    this.uiHud.setLanguage(l)
    this.uiHud.hidePicker()
    this.audio.playClick()
    this.state = "idle"
    this.placeScanSurface()
    this.uiHud.showScanFrame()
    print(`[BeautyScan] language: ${l} — waiting for pinch / scan button`)
  }


  /** Same path a real pinch takes (used by LEAF; GestureModule pinches don't fire in the editor). */
  simulatePinch(): void {
    this.startScan("pinch")
  }

  // ── Scan ────────────────────────────────────────────────────────────────────────
  private startScan(trigger: string) {
    if (this.state !== "idle") return
    this.state = "scanning"
    this.lastTrigger = trigger
    this.scanCount++
    const token = ++this.token
    this.scanDeadline = getTime() + BeautyScan.SCAN_WATCHDOG_SEC
    this.uiHud.clearMessage()
    this.uiHud.setScanning(true)
    this.audio.playSweep()
    print(`[BeautyScan] scan #${this.scanCount} (${trigger})`)

    const testTex = this.testFrameOverride
    const capture: Promise<ScanInput> = testTex
      ? encodeJpeg(testTex).then((b64) => {
          this.lastCaptureSource = "test-texture"
          return {b64, texture: testTex}
        })
      : this.camera.captureBest(this).then((r) => {
          this.lastCaptureSource = "camera-" + r.source
          return {b64: r.b64, texture: r.texture}
        })

    capture
      .then((input) => {
        this.lastCapturedBytes = Math.floor((input.b64.length * 3) / 4)
        print(`[BeautyScan] frame captured (${this.lastCaptureSource}, ${this.lastCapturedBytes} bytes) → AI`)
        return runScan(this, this.internet, input, STRINGS[this.lang].aiLanguage, cropBarcode, (n) => this.showStage(token, n))
      })
      .then((outcome) => {
        if (token !== this.token) return
        this.applyOutcome(outcome)
      })
      .catch((e) => {
        if (token !== this.token) return
        print("[BeautyScan] scan failed: " + e)
        this.applyOutcome({kind: "offline", reason: String(e), log: [String(e)]})
      })
  }

  /** "Leyendo el producto… 3/5" — tells which step is running (and where it got stuck, if it does). */
  private showStage(token: number, n: number): void {
    if (token !== this.token || this.state !== "scanning") return
    const S = STRINGS[this.lang]
    print(`[BeautyScan] step ${n}/5`)
    this.uiHud.setPrompt(n === 2 ? `${S.readingCode} 2/5` : `${S.promptReading} ${n}/5`)
  }

  private tickWatchdog(): void {
    if (this.state !== "scanning" || getTime() < this.scanDeadline) return
    this.token++ // drop whatever is still running
    print(`[BeautyScan] watchdog: scan took more than ${BeautyScan.SCAN_WATCHDOG_SEC}s — giving up`)
    this.applyOutcome({kind: "offline", reason: "watchdog", log: ["watchdog timeout"]})
  }

  // ── Manual barcode (AR keyboard) ─────────────────────────────────────────────────
  private typed = ""

  private openKeyboard(): void {
    if (this.state !== "idle") return
    this.state = "typing"
    this.typed = ""
    this.keyboardOpenedAt = getTime()
    this.pinchBlockedUntil = Number.MAX_VALUE
    this.audio.playClick()
    const S = STRINGS[this.lang]
    this.uiHud.setButtonsVisible(false)
    this.uiHud.setPrompt(S.typeHint)
    let submitted = false
    try {
      require("LensStudio:TextInputModule")
    } catch (e) {
      // older runtimes expose global.textInputSystem without the module require
    }
    try {
      const options = new TextInputSystem.KeyboardOptions()
      options.enablePreview = true
      options.keyboardType = TextInputSystem.KeyboardType.Num
      options.returnKeyType = TextInputSystem.ReturnKeyType.Done
      options.onTextChanged = (text: string) => {
        this.typed = text.replace(/\D/g, "")
        this.uiHud.setPrompt(this.typed ? this.typed : S.typeHint)
      }
      options.onReturnKeyPressed = () => {
        submitted = true
        global.textInputSystem.dismissKeyboard()
        this.submitCode(this.typed)
      }
      options.onKeyboardStateChanged = (open: boolean) => {
        print(`[BeautyScan] keyboard ${open ? "open" : "closed"} (typed "${this.typed}")`)
        if (open || submitted || this.state !== "typing") return
        // Some runtimes report "closed" right while opening: ignore that.
        if (getTime() - this.keyboardOpenedAt < 1.0) return
        // Closed without Done: use the digits if there are enough, else cancel.
        const t = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
        t.bind(() => {
          if (submitted || this.state !== "typing") return
          if (this.typed.length >= 8) {
            submitted = true
            this.submitCode(this.typed)
          } else this.cancelTyping()
        })
        t.reset(0.4)
      }
      options.onError = (code: number, description: string) => {
        print(`[BeautyScan] keyboard error ${code}: ${description}`)
        if (this.state === "typing") this.cancelTyping()
      }
      global.textInputSystem.requestKeyboard(options)
      print("[BeautyScan] keyboard requested")
    } catch (e) {
      print("[BeautyScan] keyboard unavailable: " + e)
      this.cancelTyping()
    }
  }

  private cancelTyping(): void {
    this.pinchBlockedUntil = getTime() + 1.5
    this.state = "idle"
    this.uiHud.setButtonsVisible(true)
    this.uiHud.clearMessage()
  }

  /** Same path as the keyboard's Done key (also handy for LEAF tests). */
  submitCode(code: string): void {
    if (this.state !== "typing" && this.state !== "idle") return
    this.pinchBlockedUntil = getTime() + 1.5
    this.state = "scanning"
    this.scanCount++
    const token = ++this.token
    this.scanDeadline = getTime() + BeautyScan.SCAN_WATCHDOG_SEC
    this.uiHud.setButtonsVisible(true)
    this.uiHud.setScanning(true)
    this.audio.playSweep()
    print(`[BeautyScan] typed code "${code}"`)
    runCode(this, this.internet, code, STRINGS[this.lang].aiLanguage, (n) => this.showStage(token, n))
      .then((outcome) => {
        if (token === this.token) this.applyOutcome(outcome)
      })
      .catch((e) => {
        if (token !== this.token) return
        this.applyOutcome({kind: "offline", reason: String(e), log: [String(e)]})
      })
  }

  private applyOutcome(outcome: ScanOutcome) {
    this.lastOutcomeKind = outcome.kind
    this.lastLog = outcome.log
    for (const l of outcome.log) print("[BeautyScan]   " + l)
    this.uiHud.setScanning(false)
    if (outcome.kind === "result") {
      this.lastResult = outcome.result
      this.state = "result"
      this.audio.playBeep()
      this.showCard(outcome.result)
      print(`[BeautyScan] result: ${outcome.result.name} — ${outcome.result.score}/100 ${outcome.result.verdict}`)
      return
    }
    this.lastResult = null
    this.state = "idle"
    const S = STRINGS[this.lang]
    const msg =
      outcome.kind === "unreadable"
        ? S.unreadable
        : outcome.kind === "no_barcode"
          ? S.noBarcodeRead
          : outcome.kind === "no_data"
            ? S.noData(outcome.product) + (outcome.diag ? "\n(" + outcome.diag + ")" : "")
            : outcome.kind === "not_cosmetic"
              ? S.notCosmetic(outcome.product)
              : outcome.kind === "bad_code"
              ? S.badCode
              : S.offline
    this.uiHud.showMessage(msg, outcome.kind === "no_data" || outcome.kind === "not_cosmetic" ? 12 : 5)
    print(`[BeautyScan] ${outcome.kind}`)
  }

  private showCard(r: ScanResult) {
    const S = STRINGS[this.lang]
    const subtitle = [r.brand, r.barcode ? "EAN " + r.barcode : S.noBarcode].filter((s) => !!s).join(" · ")
    const view: ResultView = {
      name: r.name || S.unnamed,
      subtitle,
      score: r.score,
      scoreColor: scoreColor(r.score),
      verdict: S.verdict[r.verdict],
      problems: r.problems.map((p) => ({name: p.name, tag: p.tag, risk: p.risk})),
      sensitiveSkin: r.sensitiveSkin || S.sensitiveDefault,
      alternative: r.score < 50 ? r.alternative : "",
      source: r.source === "web" && r.site ? `${S.source.web} — ${r.site}` : S.source[r.source],
    }
    this.uiHud.hideScanFrame()
    const pose = this.cardPose()
    this.uiHud.showResult(view, pose.pos, pose.rot)
  }

  private closeResult() {
    if (this.state !== "result") return
    this.uiHud.hideResult()
    this.state = "idle"
    this.audio.playClick()
    this.placeScanSurface()
    this.uiHud.showScanFrame()
  }

  // ── Follow ──────────────────────────────────────────────────────────────────────
  /** Every frame: ease the visible surface toward its target pose in front of the user. */
  private follow(): void {
    if (!this.camTransform) return
    const dt = Math.min(getDeltaTime(), 0.1)
    if (this.state === "result" && this.uiHud.isCardGrabbed()) {
      // The user placed the card by hand: keep that position, just keep it facing them.
      const at = this.uiHud.getCardPosition()
      this.uiHud.rotateCard(this.facing(at, this.camBasis().pos))
      return
    }
    if (this.state === "result") {
      const target = this.cardTarget()
      if (!this.cardPos || !this.cardRot) {
        this.cardPos = target.pos
        this.cardRot = target.rot
      }
      // Lazy follow: stay put while the user reads; re-centre when the card drifts out of view.
      const b = this.camBasis()
      const toCard = this.cardPos.sub(b.pos).normalize()
      const offDeg = (Math.acos(Math.max(-1, Math.min(1, toCard.dot(b.gaze)))) * 180) / Math.PI
      if (offDeg > CARD_DEADZONE_DEG) this.cardFollowing = true
      if (this.cardFollowing) {
        const k = 1 - Math.exp(-dt * FOLLOW_SPEED_CARD)
        this.cardPos = vec3.lerp(this.cardPos, target.pos, k)
        this.cardRot = quat.slerp(this.cardRot, target.rot, k)
        if (this.cardPos.distance(target.pos) < 0.5) this.cardFollowing = false
      }
      this.uiHud.placeCard(this.cardPos, this.cardRot)
      return
    }
    const target = this.scanTarget()
    if (!this.scanPos || !this.scanRot) {
      this.scanPos = target.pos
      this.scanRot = target.rot
    } else {
      const k = 1 - Math.exp(-dt * FOLLOW_SPEED_SCAN)
      this.scanPos = vec3.lerp(this.scanPos, target.pos, k)
      this.scanRot = quat.slerp(this.scanRot, target.rot, k)
    }
    if (this.state === "language") this.uiHud.placePicker(this.scanPos, this.scanRot)
    else this.uiHud.placeScan(this.scanPos, this.scanRot)
  }

  // ── Poses ───────────────────────────────────────────────────────────────────────
  private camBasis(): {pos: vec3; fwd: vec3; right: vec3; gaze: vec3} {
    const t = this.camTransform
    const pos = t ? t.getWorldPosition() : vec3.zero()
    const back = t ? t.forward : vec3.forward() // camera looks along -forward
    let gaze = back.uniformScale(-1)
    if (gaze.length < 0.001) gaze = new vec3(0, 0, -1)
    gaze = gaze.normalize()
    let fwd = new vec3(gaze.x, 0, gaze.z)
    if (fwd.length < 0.001) fwd = new vec3(0, 0, -1)
    fwd = fwd.normalize()
    const right = fwd.cross(vec3.up()).normalize()
    return {pos, fwd, right, gaze}
  }

  /** Yaw-only rotation whose local +Z points toward the user (kept upright). */
  private facing(fromPos: vec3, camPos: vec3): quat {
    const d = camPos.sub(fromPos)
    return quat.angleAxis(Math.atan2(d.x, d.z), vec3.up())
  }

  /** Scan surface: centred on the gaze (so it sits on the product when you look down at it). */
  private scanTarget(): {pos: vec3; rot: quat} {
    const b = this.camBasis()
    const pos = b.pos.add(b.gaze.uniformScale(SCAN_DISTANCE))
    return {pos, rot: this.facing(pos, b.pos)}
  }

  /** Result card: straight ahead at eye level. */
  private cardTarget(): {pos: vec3; rot: quat} {
    const b = this.camBasis()
    const pos = b.pos.add(b.fwd.uniformScale(CARD_DISTANCE)).add(new vec3(0, -CARD_DROP, 0))
    return {pos, rot: this.facing(pos, b.pos)}
  }

  private placeScanSurface() {
    const t = this.scanTarget()
    this.scanPos = t.pos
    this.scanRot = t.rot
    if (this.state === "language") this.uiHud.placePicker(t.pos, t.rot)
    else this.uiHud.placeScan(t.pos, t.rot)
  }

  private cardPose(): {pos: vec3; rot: quat} {
    const t = this.cardTarget()
    this.cardPos = t.pos
    this.cardRot = t.rot
    this.cardFollowing = false
    return t
  }
}
