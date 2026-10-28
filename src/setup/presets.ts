import type { Citation } from '../data/index.ts';
import type { Mode, Setup } from './types.ts';

// Presets are definitions and user choices, not measurements, so they carry
// no citation, except the safe areas, which come from a published standard.

export interface AspectPreset {
  id: string;
  label: string;
  /** Width / height; undefined for "full" (the format's own shape). */
  ratio?: number;
}

export const ASPECTS: Record<Mode, AspectPreset[]> = {
  cinema: [
    { id: '2.39', label: '2.39', ratio: 2.39 },
    { id: '2:1', label: '2:1', ratio: 2 },
    { id: '1.85', label: '1.85', ratio: 1.85 },
    { id: '16:9', label: '16:9', ratio: 16 / 9 },
    { id: '1.43', label: '1.43', ratio: 1.43 },
    { id: '4:3', label: '4:3', ratio: 4 / 3 },
    { id: '1:1', label: '1:1', ratio: 1 },
    { id: '9:16', label: '9:16', ratio: 9 / 16 },
    { id: 'full', label: 'Full' },
  ],
  stills: [
    { id: '3:2', label: '3:2', ratio: 3 / 2 },
    { id: '4:3', label: '4:3', ratio: 4 / 3 },
    { id: '16:9', label: '16:9', ratio: 16 / 9 },
    { id: '1:1', label: '1:1', ratio: 1 },
    { id: '4:5', label: '4:5', ratio: 4 / 5 },
    { id: '5:4', label: '5:4', ratio: 5 / 4 },
    { id: '9:16', label: '9:16', ratio: 9 / 16 },
    { id: 'full', label: 'Full' },
  ],
};

/** Generic prime sets per mode (mm). Editable later via custom lenses. */
export const LENS_STOPS: Record<Mode, number[]> = {
  cinema: [18, 25, 32, 40, 50, 75, 100, 135],
  stills: [14, 24, 35, 50, 85, 135, 200],
};

export const SQUEEZES = [1, 1.33, 1.5, 1.8, 2];

/** Safe-area margins on every side, as a share of the frame. */
export const SAFE_AREAS: { action: number; graphics: number; citation: Citation } = {
  action: 0.035,
  graphics: 0.05,
  citation: { ref: 'ebu-r95-2017', locator: 'Note 5' },
};

export const FRAME_COLORS = {
  accent: 'var(--accent)',
  amber: '#f5b301',
  white: '#ffffff',
  red: '#ff4d4d',
} as const;

export function defaultSetup(mode: Mode = 'cinema'): Setup {
  const cinema = mode === 'cinema';
  return {
    v: 1,
    mode,
    sensorId: cinema ? 'arri/alexa-35' : 'nikon/z6iii',
    formatId: cinema ? '4k-16-9' : 'fx',
    aspect: cinema ? '2.39' : '3:2',
    squeeze: 1,
    focal: cinema ? 35 : 50,
    focalEntry: 'actual',
    guides: { thirds: true, golden: false, centre: false, safe: false },
    frameColor: 'accent',
    mask: 0.55,
    distance: 3,
  };
}

export function aspectPreset(mode: Mode, id: string): AspectPreset | undefined {
  return ASPECTS[mode].find((a) => a.id === id);
}

/** How a frame is written in readouts: "2.39:1", "16:9", "Full format". */
export function aspectText(mode: Mode, id: string): string {
  const label = aspectPreset(mode, id)?.label;
  if (!label || id === 'full') return 'Full format';
  return label.includes(':') ? label : `${label}:1`;
}
