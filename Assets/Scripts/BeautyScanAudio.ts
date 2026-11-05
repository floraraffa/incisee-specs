// Beauty Scan — SFX helpers. All cues are input-reactive, so they use LowLatency playback.

const SFX_SCAN_SWEEP = requireAsset("../GeneratedSFX/ScanSweep.wav") as AudioTrackAsset
const SFX_SCAN_BEEP = requireAsset("../GeneratedSFX/ScanBeep.wav") as AudioTrackAsset
const SFX_UI_CLICK = requireAsset("../GeneratedSFX/UIClick.wav") as AudioTrackAsset

export class BeautyScanAudio {
  private sweep: AudioComponent
  private beep: AudioComponent
  private click: AudioComponent

  constructor(parent: SceneObject) {
    this.sweep = this.make(parent, "SFX_ScanSweep", SFX_SCAN_SWEEP, 0.8)
    this.beep = this.make(parent, "SFX_ScanBeep", SFX_SCAN_BEEP, 0.9)
    this.click = this.make(parent, "SFX_UIClick", SFX_UI_CLICK, 0.7)
  }

  playSweep(): void {
    this.play(this.sweep)
  }
  playBeep(): void {
    this.play(this.beep)
  }
  playClick(): void {
    this.play(this.click)
  }

  private make(parent: SceneObject, name: string, track: AudioTrackAsset, volume: number): AudioComponent {
    const so = global.scene.createSceneObject(name)
    so.setParent(parent)
    const audio = so.createComponent("Component.AudioComponent") as AudioComponent
    audio.audioTrack = track
    audio.volume = volume
    audio.playbackMode = Audio.PlaybackMode.LowLatency
    return audio
  }

  private play(a: AudioComponent): void {
    if (!a || !a.audioTrack) return
    if (a.isPlaying()) a.stop(false)
    a.play(1)
  }
}
