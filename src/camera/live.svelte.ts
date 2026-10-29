import { getDevice } from '../data/index.ts';
import { vf } from '../setup/store.svelte.ts';
import { displaySize } from '../setup/derive.ts';
import { aspectText } from '../setup/presets.ts';
import { t } from '../i18n/en.ts';
import { ASSUMED, calibrationFov } from './calibration.ts';
import { planZoom, streamTangents, videoBox, type Calibration } from './lens.ts';
import type { CameraInfo, Capabilities, LiveError } from './stream.ts';

// Live-camera state, shared by the stage, the Live panel and the dock. The
// stream code itself (stream.ts) is loaded only when the user turns Live on.
// Calibration lasts for the session only (owner decision; saving comes in P6).

/** off + source "live" = the explainer before the browser asks for permission. */
export type LiveStatus = 'off' | 'asking' | 'on' | 'paused' | LiveError;

type StreamModule = typeof import('./stream.ts');
let mod: Promise<StreamModule> | undefined;
const streamModule = () => (mod ??= import('./stream.ts'));

class LiveStore {
  source = $state<'scene' | 'live'>('scene');
  status = $state<LiveStatus>('off');
  stream = $state.raw<MediaStream | null>(null);
  cameras = $state<CameraInfo[]>([]);
  deviceId = $state<string | undefined>(undefined);
  facing = $state<'user' | 'environment' | undefined>(undefined);
  caps = $state<Capabilities>({ torch: false });
  /** Video size in pixels as displayed (follows rotation). */
  video = $state({ width: 0, height: 0 });
  /** Zoom the camera reports after applying it. */
  appliedZoom = $state(1);
  /** Exposure compensation in stops, as the camera reports it (0 for a new stream). */
  ev = $state(0);
  /** null = not calibrated yet (an assumed device is used). */
  calibration = $state<Calibration | null>(null);
  /** Touch device: assume a phone rather than a webcam. */
  phone = $state(true);
  fullView = $state(false);
  level = $state(false);
  roll = $state(0);
  rollValid = $state(false);
  videoEl = $state.raw<HTMLVideoElement | null>(null);

  /** The calibration in force: the user's, or the assumed device's camera. */
  effective = $derived.by((): Calibration => {
    if (this.calibration) return this.calibration;
    const a = this.phone ? ASSUMED.phone : ASSUMED.desktop;
    const front = this.facing === 'user' && getDevice(a.deviceId)?.cameras.find((c) => c.facing === 'front');
    return { kind: 'device', deviceId: a.deviceId, cameraId: front ? front.id : a.cameraId };
  });
  fov = $derived(calibrationFov(this.effective));

  /** The simulated lens's half extents in tangent space (same space as the scene). */
  lens = $derived.by(() => {
    const size = displaySize(vf.derived.area, vf.derived.squeeze);
    return { x: size.width / (2 * vf.setup.focal), y: size.height / (2 * vf.setup.focal) };
  });
  streamTan = $derived(this.video.width > 0 ? streamTangents(this.fov, this.video.width, this.video.height) : null);
  plan = $derived(this.streamTan ? planZoom(this.lens, this.streamTan, this.caps.zoom) : null);
  /** Video placement as fractions of the stage, using the zoom the camera actually applied. */
  box = $derived(this.streamTan ? videoBox(this.lens, this.streamTan, this.appliedZoom) : null);
  /** Digital enlargement on top of the applied camera zoom. */
  digital = $derived(this.plan ? this.plan.total / this.appliedZoom : 1);
  showing = $derived(this.source === 'live' && this.status === 'on' && !!this.stream);
  /** "Camera zoom 3.0x", "Digital crop 2.4x", "Camera 10.0x + digital 1.5x", "Wider than your camera". */
  modeLabel = $derived.by(() => {
    const p = this.plan;
    const m = t.vf.live.mode;
    if (!p) return '';
    if (p.mode === 'wider') return m.wider;
    const x = (n: number) => `${n.toFixed(1)}x`;
    if (p.mode === 'camera') return this.digital > 1.01 ? `${m.camera} ${x(this.appliedZoom)} + ${m.plusDigital} ${x(this.digital)}` : `${m.camera} ${x(this.appliedZoom)}`;
    return p.total < 1.01 ? m.none : `${m.digital} ${x(this.digital)}`;
  });

  /** Switch to Live: shows the explainer; the camera starts on the user's next tap. */
  begin() {
    this.source = 'live';
    if (this.status !== 'on') this.status = 'off';
  }

  async start(deviceId?: string) {
    const s = await streamModule();
    this.source = 'live';
    const problem = s.support();
    if (problem) {
      this.status = problem;
      return;
    }
    this.status = 'asking';
    s.close(this.stream);
    this.stream = null;
    try {
      const stream = await s.open(deviceId ?? this.deviceId);
      if (this.source !== 'live') {
        s.close(stream);
        return;
      }
      const track = stream.getVideoTracks()[0]!;
      const settings = track.getSettings();
      this.deviceId = settings.deviceId ?? deviceId;
      this.facing = settings.facingMode === 'user' ? 'user' : settings.facingMode === 'environment' ? 'environment' : undefined;
      this.caps = s.capabilities(track);
      this.appliedZoom = (settings as { zoom?: number }).zoom ?? 1;
      this.ev = (settings as { exposureCompensation?: number }).exposureCompensation ?? 0;
      this.video = { width: settings.width ?? 0, height: settings.height ?? 0 };
      this.stream = stream;
      this.status = 'on';
      this.followFacing();
      this.cameras = await s.listCameras();
    } catch (e) {
      this.stream = null;
      this.status = s.errorKind(e);
    }
  }

  /** A picked device keeps the matching lens when the user flips to the front camera and back. */
  private followFacing() {
    const cal = this.calibration;
    if (cal?.kind !== 'device') return;
    const cams = getDevice(cal.deviceId)?.cameras ?? [];
    const current = cams.find((c) => c.id === cal.cameraId);
    const want = this.facing === 'user' ? cams.find((c) => c.facing === 'front') : current?.facing === 'front' ? cams[0] : undefined;
    if (want && want.id !== cal.cameraId) this.calibration = { ...cal, cameraId: want.id };
  }

  /** Back to the drawn scene; the camera is released. */
  async stop() {
    this.source = 'scene';
    this.status = 'off';
    this.fullView = false;
    if (this.stream) (await streamModule()).close(this.stream);
    this.stream = null;
  }

  /** The page went to the background: release the camera, resume on return. */
  async pause() {
    if (this.status !== 'on') return;
    (await streamModule()).close(this.stream);
    this.stream = null;
    this.status = 'paused';
  }

  async resume() {
    if (this.status === 'paused') await this.start(this.deviceId);
  }

  /** Photo of the frame with a setup card; stays on the device. */
  async photo(): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
    const video = this.videoEl;
    if (!video || !this.box) return 'failed';
    try {
      const { takePhoto, savePhoto, photoName } = await import('./capture.ts');
      const d = vf.derived;
      const { w, h } = { w: Math.min(1, d.frameFraction.w), h: Math.min(1, d.frameFraction.h) };
      const css = getComputedStyle(document.documentElement);
      const v = (name: string) => css.getPropertyValue(name).trim();
      const deg = (n: number) => `${n.toFixed(1)}°`;
      const blob = await takePhoto({
        video,
        frame: { x: (1 - w) / 2, y: (1 - h) / 2, w, h },
        box: this.box,
        lines: [
          `${vf.camera.name} · ${vf.format.name} · ${aspectText(vf.setup.mode, vf.setup.aspect)} · ${vf.setup.focal} mm`,
          `H ${deg(d.fov.horizontal)}  V ${deg(d.fov.vertical)}  D ${deg(d.fov.diagonal)} · ${t.vf.readout.likeFF} ${Math.round(d.equivalent)} mm`,
          `CapXer · ${this.modeLabel}`,
        ],
        colors: { bg: v('--bg'), ink: v('--ink'), muted: v('--muted'), hatch: v('--line') },
      });
      return await savePhoto(blob, photoName(), this.phone);
    } catch {
      return 'failed';
    }
  }

  async zoom(value: number) {
    const track = this.stream?.getVideoTracks()[0];
    if (!track || !this.caps.zoom) return;
    if (await (await streamModule()).setZoom(track, value)) this.appliedZoom = (track.getSettings() as { zoom?: number }).zoom ?? value;
  }

  async exposure(ev: number) {
    const track = this.stream?.getVideoTracks()[0];
    if (!track || !this.caps.exposure) return;
    if (await (await streamModule()).setExposure(track, ev)) this.ev = (track.getSettings() as { exposureCompensation?: number }).exposureCompensation ?? ev;
  }
}

export const live = new LiveStore();
