import type { FrameColor } from '../setup/types.ts';
import type { Histogram, PeakSensitivity } from './levels.ts';

// Exposure-aid choices, shared by the stage, the Exposure panel and the full
// view. Session only, like the live calibration (saving comes in P6). The aids
// work on the live camera only; the analysis code loads on first use.

export type PictureAid = 'off' | 'zebras' | 'falseColour';

class AidsStore {
  histogram = $state(false);
  histMode = $state<'luma' | 'rgb'>('luma');
  /** Zebras and false colour together are unreadable, so the picture gets one of them. */
  picture = $state<PictureAid>('off');
  zebra = $state(95);
  peaking = $state(false);
  peakColor = $state<FrameColor>('red');
  peakSens = $state<PeakSensitivity>('medium');
  /** null = not checked yet; false = no WebGL2, so the picture aids are unavailable. */
  gpu = $state<boolean | null>(null);
  /** Latest histogram of the framed area. */
  hist = $state.raw<Histogram | null>(null);

  /** Something is drawn over the picture. */
  overlay = $derived(this.gpu !== false && (this.picture !== 'off' || this.peaking));
}

export const aids = new AidsStore();

/** WebGL2 support, checked once without keeping a context alive. */
export function checkGpu(): boolean {
  if (aids.gpu !== null) return aids.gpu;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    aids.gpu = !!gl;
  } catch {
    aids.gpu = false;
  }
  return aids.gpu;
}
