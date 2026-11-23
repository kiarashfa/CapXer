import { getSensor } from '../data/index.ts';
import {
  ev100FromLuminance,
  exposureOffsetStops,
  hyperfocal,
  depthOfField,
  METER_K,
  MID_GREY,
  settingsEv100,
  shutterTimeFromAngle,
  whiteBalanceGains,
  type DepthOfField,
} from '../optics/index.ts';
import { defaultSetup } from '../setup/presets.ts';
import type { Setup } from '../setup/types.ts';
import { readSave, updateSave } from '../storage/store.ts';
import type { Histogram } from '../analysis/levels.ts';
import type { LabState, SavedLab } from '../storage/schema.ts';
import { distance, labCamera } from './camera.ts';
import { noiseCoefficients } from './render/noise.ts';
import { TIERS, type Tier } from './render/tiers.ts';
import { SETS, getSet } from './sets/index.ts';
import { ANGLES, APERTURES, FOCUS_DISTANCES, FRAME_RATES, ISOS, SHUTTERS, WHITE_BALANCES, nearestIndex, step } from './stops.ts';
import { SUBJECTS, getSubject } from './subjects/index.ts';
import { clampPlace } from './place.ts';
import type { Light, Point } from './types.ts';

// One lab store shared by the lab's components. The camera, format, frame,
// focal length and Cinema / Stills mode come from the viewfinder's current
// setup (read from the save file at start).

/** The viewfinder setup the lab uses: the saved current one, or the default. A custom sensor falls back to the default. */
export function viewfinderSetup(): Setup {
  let setup: Setup | undefined;
  try {
    setup = readSave()?.current;
  } catch {
    setup = undefined;
  }
  if (!setup || !getSensor(setup.sensorId)) return defaultSetup('cinema');
  return setup;
}

export type LabPanel = 'set' | 'lights' | 'camera' | 'aids' | 'saved';
export type LabPictureAid = 'off' | 'zebras' | 'falseColour';

/** What the user changed about one light of the scenario. */
export interface LightEdit {
  on?: boolean;
  /** Brightness change in stops. */
  stops?: number;
  size?: number;
  kelvin?: number;
  x?: number;
  z?: number;
}

/** A light as the scene uses it (scenario + the user's edits). */
export interface LabLight extends Light {
  on: boolean;
  stops: number;
}

class LabStore {
  setup = $state.raw<Setup>(defaultSetup('cinema'));
  setId = $state('studio');
  subjectId = $state('figure');
  lightingId = $state('three-point');

  // Exposure settings, as positions in the step lists (src/lab/stops.ts).
  // Defaults: f/2.8 (T2.8), 1/50 s or 180 degrees at 24 fps, ISO (EI) 400, 5600 K.
  apertureIndex = $state(nearestIndex(APERTURES.map((s) => s.value), 2.8));
  shutterIndex = $state(SHUTTERS.findIndex((s) => s.label === '1/50 s'));
  angleIndex = $state(ANGLES.indexOf(180));
  fpsIndex = $state(FRAME_RATES.indexOf(24));
  isoIndex = $state(ISOS.indexOf(400));
  wbIndex = $state(WHITE_BALANCES.indexOf(5600));
  /** Manual focus distance in metres, or null to focus on the subject's eyes. */
  focusManual = $state<number | null>(null);

  /** User changes to the scenario's lights, by light id (cleared when the scenario changes). */
  lightEdits = $state<Record<string, LightEdit>>({});
  /** Room bounce brightness change, stops. */
  ambientStops = $state(0);
  /** Camera position on the floor when moved on the plan (height stays the set's). */
  cameraPlace = $state<{ x: number; z: number } | null>(null);

  /** A shared lab link is showing; the user's own lab and camera are kept to go back to. */
  shared = $state.raw<{ setup: Setup; state: LabState; unknownCamera: boolean } | null>(null);

  /** Named lab setups from the save file. */
  savedLabs = $state.raw<SavedLab[]>([]);
  /** A short note at the bottom of the screen ("Saved", "Deleted" with Undo, "Link copied"). */
  notice = $state.raw<{ title: string; body?: string; undo?: () => void } | null>(null);

  /** Which dock tool is open (it takes the plan's place). */
  panel = $state<LabPanel | null>(null);

  // Exposure aids on the rendered picture.
  histogram = $state(false);
  histMode = $state<'luma' | 'rgb'>('luma');
  picture = $state<LabPictureAid>('off');
  zebra = $state(95);
  hist = $state.raw<Histogram | null>(null);

  tier = $state<Tier>('medium');
  /** Render progress, for the "finished" tag. */
  samples = $state(0);
  /** Average scene luminance from the last finished picture, cd/m2 (null until measured). */
  meteredLuminance = $state<number | null>(null);

  cinema = $derived(this.setup.mode === 'cinema');
  fNumber = $derived(APERTURES[this.apertureIndex]!.value);
  fps = $derived(FRAME_RATES[this.fpsIndex]!);
  angle = $derived(ANGLES[this.angleIndex]!);
  /** Exposure time in seconds: from the shutter angle and frame rate in Cinema, the shutter speed in Stills. */
  shutter = $derived(this.cinema ? shutterTimeFromAngle(this.angle, this.fps) : SHUTTERS[this.shutterIndex]!.value);
  iso = $derived(ISOS[this.isoIndex]!);
  kelvin = $derived(WHITE_BALANCES[this.wbIndex]!);

  set = $derived(getSet(this.setId));
  subject = $derived(getSubject(this.set.subjects.includes(this.subjectId) ? this.subjectId : this.set.subjects[0]));
  lighting = $derived(this.set.lighting.find((l) => l.id === this.lightingId) ?? this.set.lighting[0]!);
  format = $derived.by(() => {
    const s = getSensor(this.setup.sensorId)!;
    return s.formats.find((f) => f.id === this.setup.formatId) ?? s.formats[0]!;
  });
  camera = $derived(labCamera(this.setup, { width: this.format.width, height: this.format.height }));
  /** Every light of the scenario with the user's edits, including the ones switched off. */
  allLights = $derived<LabLight[]>(
    this.lighting.lights.map((l) => {
      const e = this.lightEdits[l.id] ?? {};
      return {
        ...l,
        on: e.on ?? true,
        stops: e.stops ?? 0,
        candela: l.candela * 2 ** (e.stops ?? 0),
        size: e.size ?? l.size,
        kelvin: e.kelvin ?? l.kelvin,
        at: { x: e.x ?? l.at.x, y: l.at.y, z: e.z ?? l.at.z },
      };
    }),
  );
  /** The lights that are on: what the scene draws. */
  lights = $derived(this.allLights.filter((l) => l.on));
  ambient = $derived(this.lighting.ambient * 2 ** this.ambientStops);
  cameraAt = $derived<Point>(this.cameraPlace ? { x: this.cameraPlace.x, y: this.set.camera.y, z: this.cameraPlace.z } : this.set.camera);
  /** Where the camera looks: the subject's eyes. */
  focusPoint = $derived<Point>({ x: 0, y: this.subject.focusHeight, z: 0 });
  subjectM = $derived(distance(this.cameraAt, this.focusPoint));
  /** Focus distance, metres (may be Infinity). */
  focusM = $derived(this.focusManual ?? this.subjectM);
  dof = $derived.by<DepthOfField>(() => {
    if (Number.isFinite(this.focusM)) return depthOfField(this.camera.focal, this.fNumber, this.camera.coc, this.focusM * 1000);
    return { near: hyperfocal(this.camera.focal, this.fNumber, this.camera.coc), far: Infinity, total: Infinity };
  });
  /** Picture value per cd/m2 for the current settings (metered luminance -> 18 % grey). */
  exposureScale = $derived((MID_GREY * this.iso * this.shutter) / (METER_K * this.fNumber * this.fNumber));
  gains = $derived(whiteBalanceGains(this.kelvin));
  noise = $derived(noiseCoefficients(this.iso));
  settingsEv = $derived(settingsEv100(this.fNumber, this.shutter, this.iso));
  sceneEv = $derived(this.meteredLuminance && this.meteredLuminance > 0 ? ev100FromLuminance(this.meteredLuminance) : null);
  /** Stops brighter (+) or darker (-) than the meter asks for. */
  offset = $derived(this.sceneEv === null ? null : exposureOffsetStops(this.sceneEv, this.fNumber, this.shutter, this.iso));
  target = $derived(TIERS[this.tier].samples);

  load() {
    this.setup = viewfinderSetup();
  }

  /** Change the camera setup. It is the viewfinder's too: written to the save file's current setup. */
  setSetup(next: Setup) {
    this.setup = next;
    try {
      updateSave((file) => ({ ...file, current: next }));
    } catch {
      // Storage refused (private browsing): the lab keeps the change for this visit.
    }
  }

  setLighting(id: string) {
    this.lightingId = id;
    this.lightEdits = {};
    this.ambientStops = 0;
  }
  setSet(id: string) {
    this.setId = id;
    this.setLighting(getSet(id).lighting[0]!.id);
    this.cameraPlace = null;
  }
  editLight(id: string, change: LightEdit) {
    this.lightEdits = { ...this.lightEdits, [id]: { ...this.lightEdits[id], ...change } };
  }
  resetLights() {
    this.lightEdits = {};
    this.ambientStops = 0;
  }
  /** Move a light on the floor plan (metres); it keeps pointing at its aim. */
  moveLight(id: string, x: number, z: number) {
    this.editLight(id, clampPlace(this.set.room, x, z, 0.6));
  }
  /** Move the camera on the floor plan (metres); it keeps looking at the subject. */
  moveCamera(x: number, z: number) {
    this.cameraPlace = clampPlace(this.set.room, x, z, 0.8);
  }
  resetCamera() {
    this.cameraPlace = null;
  }

  // Exposure steps: +1 = one third stop more light, -1 = less.
  /** The lab's state as the save file keeps it (real values and ids). */
  toState(now = new Date()): LabState {
    const f = this.focusManual;
    return {
      set: this.setId,
      subject: this.subject.id,
      lighting: this.lighting.id,
      exposure: {
        fNumber: this.fNumber,
        shutter: SHUTTERS[this.shutterIndex]!.value,
        angle: this.angle,
        fps: this.fps,
        iso: this.iso,
        kelvin: this.kelvin,
      },
      focus: f === null ? 'subject' : f === Infinity ? 'infinity' : f,
      lights: $state.snapshot(this.lightEdits),
      ambient: this.ambientStops,
      camera: this.cameraPlace ? { ...this.cameraPlace } : null,
      aids: { histogram: this.histogram, histMode: this.histMode, picture: this.picture, zebra: this.zebra },
      changedAt: now.toISOString(),
    };
  }

  /** Show a saved or shared state. Unknown sets, subjects and scenarios fall back to defaults; values snap to the nearest step. */
  applyState(st: LabState) {
    const set = SETS.find((x) => x.id === st.set) ?? SETS[0]!;
    this.setId = set.id;
    this.subjectId = set.subjects.includes(st.subject) && SUBJECTS.some((x) => x.id === st.subject) ? st.subject : set.subjects[0]!;
    const lighting = set.lighting.find((l) => l.id === st.lighting) ?? set.lighting[0]!;
    this.lightingId = lighting.id;
    const e = st.exposure;
    this.apertureIndex = nearestIndex(APERTURES.map((x) => x.value), e.fNumber);
    this.shutterIndex = nearestIndex(SHUTTERS.map((x) => x.value), e.shutter);
    this.angleIndex = nearestIndex(ANGLES, e.angle);
    this.fpsIndex = nearestIndex(FRAME_RATES, e.fps);
    this.isoIndex = nearestIndex(ISOS, e.iso);
    this.wbIndex = nearestIndex(WHITE_BALANCES, e.kelvin);
    this.focusManual = st.focus === 'subject' ? null : st.focus === 'infinity' ? Infinity : st.focus;
    const edits: Record<string, LightEdit> = {};
    for (const [id, edit] of Object.entries(st.lights)) {
      if (!lighting.lights.some((l) => l.id === id)) continue;
      const e2 = { ...edit };
      if (e2.x !== undefined && e2.z !== undefined) Object.assign(e2, clampPlace(set.room, e2.x, e2.z, 0.6));
      edits[id] = e2;
    }
    this.lightEdits = edits;
    this.ambientStops = st.ambient;
    this.cameraPlace = st.camera ? clampPlace(set.room, st.camera.x, st.camera.z, 0.8) : null;
    this.histogram = st.aids.histogram;
    this.histMode = st.aids.histMode;
    this.picture = st.aids.picture;
    this.zebra = st.aids.zebra;
  }

  stepAperture(light: 1 | -1) {
    this.apertureIndex = step(this.apertureIndex, light === 1 ? -1 : 1, APERTURES.length);
  }
  stepShutter(light: 1 | -1) {
    if (this.cinema) this.angleIndex = step(this.angleIndex, light, ANGLES.length);
    else this.shutterIndex = step(this.shutterIndex, light === 1 ? -1 : 1, SHUTTERS.length);
  }
  stepIso(light: 1 | -1) {
    this.isoIndex = step(this.isoIndex, light, ISOS.length);
  }
  /** Whether a step in that direction is possible (for disabling buttons). */
  canStep(control: 'aperture' | 'shutter' | 'iso' | 'wb' | 'focus', d: 1 | -1): boolean {
    switch (control) {
      case 'aperture':
        return d === 1 ? this.apertureIndex > 0 : this.apertureIndex < APERTURES.length - 1;
      case 'shutter':
        if (this.cinema) return d === 1 ? this.angleIndex < ANGLES.length - 1 : this.angleIndex > 0;
        return d === 1 ? this.shutterIndex > 0 : this.shutterIndex < SHUTTERS.length - 1;
      case 'iso':
        return d === 1 ? this.isoIndex < ISOS.length - 1 : this.isoIndex > 0;
      case 'wb':
        return d === 1 ? this.wbIndex < WHITE_BALANCES.length - 1 : this.wbIndex > 0;
      case 'focus':
        return d === 1 ? this.focusM !== Infinity : this.focusM > FOCUS_DISTANCES[0]! + 1e-9;
    }
  }
  stepWhiteBalance(d: 1 | -1) {
    this.wbIndex = step(this.wbIndex, d, WHITE_BALANCES.length);
  }
  stepFocus(d: 1 | -1) {
    const from = this.focusManual ?? this.subjectM;
    // The next listed distance in that direction that is a visible change (over 2 %).
    const list = d > 0 ? FOCUS_DISTANCES : [...FOCUS_DISTANCES].reverse();
    const next = list.find((v) => (d > 0 ? v > from * 1.02 : v < from / 1.02));
    if (next !== undefined) this.focusManual = next;
  }
  focusOnSubject() {
    this.focusManual = null;
  }

  /**
   * Set the exposure the meter asks for: Stills changes the shutter speed,
   * Cinema the stop (the shutter angle is a look, not an exposure control).
   */
  matchMeter() {
    if (this.sceneEv === null) return;
    const ev = this.sceneEv;
    const offsetFor = (n: number, t: number) => Math.abs(exposureOffsetStops(ev, n, t, this.iso));
    if (this.cinema) {
      this.apertureIndex = APERTURES.reduce((best, s, i) => (offsetFor(s.value, this.shutter) < offsetFor(APERTURES[best]!.value, this.shutter) ? i : best), 0);
    } else {
      this.shutterIndex = SHUTTERS.reduce((best, s, i) => (offsetFor(this.fNumber, s.value) < offsetFor(this.fNumber, SHUTTERS[best]!.value) ? i : best), 0);
    }
  }
}

export const lab = new LabStore();
