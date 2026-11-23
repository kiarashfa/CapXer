import { MID_GREY } from '../../optics/index.ts';

// Sensor noise in the lab: a simplified teaching model with CapXer's own
// numbers, not any real camera (the page says so).
//
// The idea it shows: grain comes from how little light reached the sensor.
// Light (photons) per pixel depends on the scene, aperture and shutter, not on
// ISO; ISO only amplifies the signal. So a picture made bright with high ISO
// came from few photons and looks grainy.
// - Photon (shot) noise: a pixel that caught Q photons varies by sqrt(Q).
// - Read noise: a fixed few electrons per pixel, amplified with the ISO gain.
// Q for a mid-grey pixel at ISO 100 and READ_E are our choices, picked so that
// ISO 100 looks clean and ISO 12800 is clearly grainy.

/** Photons caught by a mid-grey pixel at ISO 100 (our number). */
export const PHOTONS_MID_ISO100 = 8000;
/** Read noise, electrons (our number). */
export const READ_E = 3;

/**
 * Standard deviation of a pixel's picture value `v` (linear, mid grey = 0.18
 * at a metered exposure) at ISO `iso`.
 */
export function noiseSigma(v: number, iso: number): number {
  const perUnit = (PHOTONS_MID_ISO100 * 100) / (MID_GREY * iso); // photons per unit of picture value
  const photons = Math.max(0, v) * perUnit;
  return Math.sqrt(photons + READ_E * READ_E) / perUnit;
}

/** The shader gets the same model as two numbers: sigma^2 = v * a + b. */
export function noiseCoefficients(iso: number): { a: number; b: number } {
  const perUnit = (PHOTONS_MID_ISO100 * 100) / (MID_GREY * iso);
  return { a: 1 / perUnit, b: (READ_E * READ_E) / (perUnit * perUnit) };
}
