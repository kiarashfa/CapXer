import { displayName, getSensor } from '../data/index.ts';
import { derive } from './derive.ts';
import { focalRange, fromEntry, stepFocal } from './focal.ts';
import { aspectPreset, defaultSetup, LENS_STOPS } from './presets.ts';
import type { CustomSensor, FocalEntry, Mode, PanelId, Setup } from './types.ts';

// One viewfinder store shared by every island on the page (the dock tools in
// the header and the viewfinder in the page import the same module instance).

export interface CameraFormat {
  id: string;
  name: string;
  width: number;
  height: number;
  squeeze?: number;
}

export interface Camera {
  id: string;
  name: string;
  custom: boolean;
  formats: CameraFormat[];
}

export function resolveCamera(id: string, customs: CustomSensor[]): Camera {
  if (id.startsWith('custom/')) {
    const c = customs.find((s) => s.id === id);
    if (c) {
      return {
        id: c.id,
        name: c.name,
        custom: true,
        formats: [{ id: 'custom', name: `${c.width} x ${c.height} mm`, width: c.width, height: c.height, squeeze: c.squeeze > 1 ? c.squeeze : undefined }],
      };
    }
  }
  const s = getSensor(id) ?? getSensor(defaultSetup().sensorId)!;
  return { id: s.id, name: displayName(s), custom: false, formats: s.formats };
}

class ViewfinderStore {
  setup = $state<Setup>(defaultSetup('cinema'));
  customs = $state<CustomSensor[]>([]);
  customLenses = $state<number[]>([]);
  /** Which control panel is open (tab on phone, floating panel on desktop). */
  panel = $state<PanelId | null>(null);

  camera = $derived(resolveCamera(this.setup.sensorId, this.customs));
  format = $derived(this.camera.formats.find((f) => f.id === this.setup.formatId) ?? this.camera.formats[0]!);
  derived = $derived(derive(this.setup, { width: this.format.width, height: this.format.height }));
  range = $derived(focalRange(this.derived.crop));
  /** Lens stops as shown (in the current entry unit), sorted. */
  stopLabels = $derived([...new Set([...LENS_STOPS[this.setup.mode], ...this.customLenses])].sort((a, b) => a - b));
  /** The same stops as actual focal lengths. */
  stopsActual = $derived(this.stopLabels.map((s) => fromEntry(s, this.setup.focalEntry, this.derived.crop)));

  setMode(mode: Mode) {
    this.setup.mode = mode;
    if (!aspectPreset(mode, this.setup.aspect)) this.setup.aspect = 'full';
  }

  setCamera(id: string) {
    const cam = resolveCamera(id, this.customs);
    this.setup.sensorId = cam.id;
    this.setFormat(cam.formats[0]!.id, cam);
  }

  setFormat(id: string, cam: Camera = this.camera) {
    const fmt = cam.formats.find((f) => f.id === id) ?? cam.formats[0]!;
    this.setup.formatId = fmt.id;
    this.setup.squeeze = fmt.squeeze ?? 1;
  }

  setFocal(actual: number) {
    const { min, max } = this.range;
    this.setup.focal = Math.min(max, Math.max(min, actual));
  }

  step(direction: 1 | -1) {
    this.setFocal(stepFocal(this.setup.focal, this.stopsActual, direction));
  }

  setEntry(entry: FocalEntry) {
    this.setup.focalEntry = entry;
  }

  addCustomSensor(input: Omit<CustomSensor, 'id'>): string {
    const id = `custom/${this.customs.length + 1}`;
    this.customs.push({ ...input, id });
    this.setCamera(id);
    return id;
  }

  addLens(label: number) {
    if (label > 0 && !this.customLenses.includes(label)) this.customLenses.push(label);
  }
}

export const vf = new ViewfinderStore();
