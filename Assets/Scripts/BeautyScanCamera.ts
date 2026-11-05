// Beauty Scan — Camera Module access (SPECS 27 / Lens Studio 5.23; Default_Color on device too).
// One camera request for the Lens lifetime; frames are encoded to JPEG only when the user scans,
// and never stored.
//
// Default_Color = webcam / simulated feed in the editor, the device's color camera on Specs.

export class BeautyScanCamera {
  private cameraModule: CameraModule = require("LensStudio:CameraModule")
  private texture: Texture | null = null
  private registration: EventRegistration | null = null
  public frameCount = 0
  public cameraIdName = ""

  /** Call from OnStartEvent (never onAwake). */
  start(editorSmallerDimension: number = 512, deviceSmallerDimension: number = 756): void {
    if (this.texture) return
    const isEditor = global.deviceInfoSystem.isEditor()
    const req = CameraModule.createCameraRequest()
    req.cameraId = CameraModule.CameraId.Default_Color
    this.cameraIdName = "Default_Color"
    // Higher resolution on device so the EAN digits under the barcode stay legible for Gemini.
    req.imageSmallerDimension = isEditor ? editorSmallerDimension : deviceSmallerDimension
    this.texture = this.cameraModule.requestCamera(req)
    const provider = this.texture.control as CameraTextureProvider
    this.registration = provider.onNewFrame.add(() => {
      this.frameCount++
    })
    print(`[BeautyScanCamera] requested ${this.cameraIdName} (${req.imageSmallerDimension}px)`)
  }

  stop(): void {
    if (this.texture && this.registration) {
      ;(this.texture.control as CameraTextureProvider).onNewFrame.remove(this.registration)
    }
    this.registration = null
  }

  get isLive(): boolean {
    return this.frameCount > 0
  }

  get cameraTexture(): Texture | null {
    return this.texture
  }

  /** JPEG-encode the current camera frame. */
  captureJpeg(): Promise<string> {
    if (!this.texture || this.frameCount === 0) return Promise.reject(new Error("camera has no frames yet"))
    return encodeJpeg(this.texture)
  }

  /**
   * Best image for reading barcode digits: on device, a high-resolution still (requestImage);
   * if the still is unsupported or slow (> timeoutSec), the current streaming frame.
   * `source` reports which one was used.
   */
  captureBest(owner: BaseScriptComponent, timeoutSec: number = 2.5): Promise<Capture> {
    // Frame path: freeze the live texture first, so the barcode crop later uses the exact same pixels.
    const frame = (): Promise<Capture> => {
      if (!this.texture || this.frameCount === 0) return Promise.reject(new Error("camera has no frames yet"))
      let tex: Texture = this.texture
      try {
        tex = ProceduralTextureProvider.createFromTexture(this.texture)
      } catch (e) {
        print("[BeautyScanCamera] frame snapshot failed (" + e + ") — barcode zoom disabled for this scan")
        return encodeJpeg(this.texture).then((b64) => ({b64, source: "frame", texture: null}))
      }
      const live = this.texture
      // If the snapshot can't be encoded (or takes > 3 s), encode the live frame instead.
      return encodeJpeg(tex, 3).then(
        (b64) => ({b64, source: "frame", texture: tex}),
        (e) => {
          print("[BeautyScanCamera] snapshot encode failed (" + e + ") — using live frame")
          return encodeJpeg(live, 4).then((b64) => ({b64, source: "frame", texture: null}))
        }
      )
    }
    if (global.deviceInfoSystem.isEditor() || this.stillFailed) return frame()
    return new Promise((resolve, reject) => {
      let done = false
      const fallback = (why: string) => {
        if (done) return
        done = true
        print("[BeautyScanCamera] still image unavailable (" + why + ") — using frame")
        frame().then(resolve, reject)
      }
      const timer = owner.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
      timer.bind(() => fallback("timeout"))
      timer.reset(timeoutSec)
      try {
        const req = CameraModule.createImageRequest()
        req.resolution = new vec2(1280, 960) // sharp enough for EAN digits, small enough to upload fast
        this.cameraModule
          .requestImage(req)
          .then((img) => {
            if (done) return
            encodeJpeg(img.texture).then(
              (b64) => {
                if (done) return
                done = true
                resolve({b64, source: "still", texture: img.texture})
              },
              (e) => fallback(String(e))
            )
          })
          .catch((e) => {
            this.stillFailed = true
            fallback(String(e))
          })
      } catch (e) {
        this.stillFailed = true
        fallback(String(e))
      }
    })
  }

  private stillFailed = false
}

export interface Capture {
  b64: string
  source: string
  texture: Texture | null // the exact image sent to Gemini (for the barcode close-up)
}

/**
 * Barcode close-up: crop the box Gemini returned ([ymin, xmin, ymax, xmax], 0–1000 from the image
 * top-left) with margin, convert to grey with a contrast stretch (helps in low light), enlarge it,
 * and JPEG-encode. `flipY` tries the other row origin (texture rows may start at the bottom).
 * Resolves null if the crop can't be made.
 */
export function cropBarcode(tex: Texture, box: number[], flipY: boolean): Promise<string | null> {
  try {
    const W = tex.getWidth()
    const H = tex.getHeight()
    const [y0, x0, y1, x1] = box
    const bw = ((x1 - x0) / 1000) * W
    const bh = ((y1 - y0) / 1000) * H
    const padX = bw * 0.2 + 8
    const padY = bh * 0.35 + 8
    const cx0 = clampInt((x0 / 1000) * W - padX, 0, W - 1)
    const cx1 = clampInt((x1 / 1000) * W + padX, 1, W)
    let ry0 = (y0 / 1000) * H - padY
    let ry1 = (y1 / 1000) * H + padY
    if (!flipY) {
      // Lens Studio texture rows start at the bottom; the box is measured from the top.
      const t = H - ry1
      ry1 = H - ry0
      ry0 = t
    }
    const cy0 = clampInt(ry0, 0, H - 1)
    const cy1 = clampInt(ry1, 1, H)
    const w = cx1 - cx0
    const h = cy1 - cy0
    if (w < 16 || h < 8) return Promise.resolve(null)

    const srcTex = ProceduralTextureProvider.createFromTexture(tex)
    const src = new Uint8Array(w * h * 4)
    ;(srcTex.control as ProceduralTextureProvider).getPixels(cx0, cy0, w, h, src)

    // Grey + contrast stretch between the 2nd and 98th luminance percentiles.
    const lum = new Uint8Array(w * h)
    const hist = new Array<number>(256).fill(0)
    for (let i = 0; i < w * h; i++) {
      const l = Math.round(0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2])
      lum[i] = l
      hist[l]++
    }
    const lo = percentile(hist, w * h, 0.02)
    const hi = Math.max(lo + 1, percentile(hist, w * h, 0.98))
    for (let i = 0; i < w * h; i++) lum[i] = clampInt(((lum[i] - lo) * 255) / (hi - lo), 0, 255)

    // Enlarge (bilinear) so the long side is ~1024 px, capped at ~700k pixels.
    let k = Math.min(4, 1024 / Math.max(w, h))
    if (k < 1) k = 1
    if (w * h * k * k > 700000) k = Math.max(1, Math.sqrt(700000 / (w * h)))
    const ow = Math.max(1, Math.round(w * k))
    const oh = Math.max(1, Math.round(h * k))
    const out = new Uint8Array(ow * oh * 4)
    for (let y = 0; y < oh; y++) {
      const fy = Math.min(h - 1, (y + 0.5) / k - 0.5)
      const yA = Math.max(0, Math.floor(fy))
      const yB = Math.min(h - 1, yA + 1)
      const ty = Math.max(0, fy - yA)
      for (let x = 0; x < ow; x++) {
        const fx = Math.min(w - 1, (x + 0.5) / k - 0.5)
        const xA = Math.max(0, Math.floor(fx))
        const xB = Math.min(w - 1, xA + 1)
        const tx = Math.max(0, fx - xA)
        const top = lum[yA * w + xA] * (1 - tx) + lum[yA * w + xB] * tx
        const bot = lum[yB * w + xA] * (1 - tx) + lum[yB * w + xB] * tx
        const v = Math.round(top * (1 - ty) + bot * ty)
        const o = (y * ow + x) * 4
        out[o] = v
        out[o + 1] = v
        out[o + 2] = v
        out[o + 3] = 255
      }
    }
    const dst = ProceduralTextureProvider.create(ow, oh, Colorspace.RGBA)
    ;(dst.control as ProceduralTextureProvider).setPixels(0, 0, ow, oh, out)
    print(`[BeautyScanCamera] barcode close-up ${w}x${h} → ${ow}x${oh} (contrast ${lo}-${hi}${flipY ? ", flipped" : ""})`)
    return encodeJpeg(dst, 4).catch(() => null)
  } catch (e) {
    print("[BeautyScanCamera] barcode crop failed: " + e)
    return Promise.resolve(null)
  }
}

function clampInt(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, Math.round(v)))
}

function percentile(hist: number[], total: number, q: number): number {
  let acc = 0
  const target = total * q
  for (let i = 0; i < 256; i++) {
    acc += hist[i]
    if (acc >= target) return i
  }
  return 255
}

/** JPEG-encode a texture; rejects on failure or after `timeoutSec` (0 = no timeout). */
export function encodeJpeg(tex: Texture, timeoutSec: number = 0): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let done = false
    if (timeoutSec > 0) {
      const t0 = getTime()
      // Checked every frame by tickEncodeTimeouts() (main script's UpdateEvent); true = remove.
      encodeTimeoutChecks.push(() => {
        if (done) return true
        if (getTime() - t0 < timeoutSec) return false
        done = true
        reject(new Error("JPEG encode timeout"))
        return true
      })
    }
    try {
      Base64.encodeTextureAsync(
        tex,
        (b64) => {
          if (done) return
          done = true
          resolve(b64)
        },
        () => {
          if (done) return
          done = true
          reject(new Error("JPEG encode failed"))
        },
        CompressionQuality.HighQuality,
        EncodingType.Jpg
      )
    } catch (e) {
      done = true
      reject(e)
    }
  })
}

const encodeTimeoutChecks: (() => boolean)[] = []
/** Call every frame (main script UpdateEvent) so encode timeouts fire. */
export function tickEncodeTimeouts(): void {
  for (let i = encodeTimeoutChecks.length - 1; i >= 0; i--) if (encodeTimeoutChecks[i]()) encodeTimeoutChecks.splice(i, 1)
}
