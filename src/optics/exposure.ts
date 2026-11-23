import type { Citation } from '../data/index.ts';

// Exposure maths for the v2 lab. Pure: no DOM, unit-tested.
//
// Conventions:
// - N is the f-number, t the exposure (shutter) time in seconds, S the ISO
//   arithmetic speed, L scene luminance in cd/m2.
// - Exposure value: EV = log2(N^2 / t). EV 0 is f/1 at 1 s. "EV100" is the
//   exposure value that suits ISO 100; at speed S the same light needs
//   EV_S = EV100 + log2(S / 100).
// - Reflected-light meter equation (ISO 2720:1974, quoted by the EV source):
//   N^2 / t = L * S / K, with K = 12.5 as used by Sekonic meters.
// - The lab's lenses are ideal (they pass all light), so a T-stop equals the
//   f-number there. Real cinema lenses lose some light; that is not modelled.
// - Turning light into a picture value is CapXer's own convention, not a
//   standard: a correctly metered exposure puts the metered luminance at 18 %
//   (the same grey card the exposure aids measure their bands from), and every
//   stop of extra exposure doubles the value.

export const EV_SOURCE: Citation = { ref: 'wikipedia-exposure-value', locator: 'Formal definition; Relationship of EV to lighting conditions' };
export const METER_K_SOURCE: Citation = { ref: 'sekonic-meter-calibration', locator: 'Answer' };
export const SHUTTER_ANGLE_SOURCE: Citation = { ref: 'red-shutter-angle', locator: 'Concept; Appearance' };

/** Reflected-light meter calibration constant K (cd s / m2 per ISO), Sekonic's value. */
export const METER_K = 12.5;

/** Picture value (linear, 0 to 1 is the normal range) of the metered luminance at a correct exposure. CapXer's convention. */
export const MID_GREY = 0.18;

function positive(name: string, ...values: number[]) {
  for (const v of values) if (!(v > 0 && Number.isFinite(v))) throw new RangeError(`${name} must be positive and finite`);
}

/** Exposure value of an aperture and shutter time: log2(N^2 / t). */
export function exposureValue(fNumber: number, seconds: number): number {
  positive('f-number and shutter time', fNumber, seconds);
  return Math.log2((fNumber * fNumber) / seconds);
}

/** Exposure value of camera settings, expressed for ISO 100 (EV100). */
export function settingsEv100(fNumber: number, seconds: number, iso: number): number {
  positive('ISO', iso);
  return exposureValue(fNumber, seconds) - Math.log2(iso / 100);
}

/** EV100 that a reflected-light meter reads for an average scene luminance (cd/m2). */
export function ev100FromLuminance(luminance: number, k = METER_K): number {
  positive('luminance and K', luminance, k);
  return Math.log2((luminance * 100) / k);
}

/** Average scene luminance (cd/m2) that a meter reads as the given EV100. */
export function luminanceFromEv100(ev100: number, k = METER_K): number {
  return (k * 2 ** ev100) / 100;
}

/**
 * How far the settings are from the meter's exposure, in stops. Positive =
 * more light than the meter asks for (brighter, overexposed), negative = darker.
 */
export function exposureOffsetStops(sceneEv100: number, fNumber: number, seconds: number, iso: number): number {
  return sceneEv100 - settingsEv100(fNumber, seconds, iso);
}

/** Shutter time (s) that gives the scene's EV100 at an aperture and ISO. */
export function shutterForEv100(ev100: number, fNumber: number, iso: number): number {
  positive('f-number and ISO', fNumber, iso);
  return (fNumber * fNumber) / 2 ** (ev100 + Math.log2(iso / 100));
}

/**
 * Picture value of a luminance under the given settings (linear, before any
 * tone curve). MID_GREY when the settings match what the meter asks for this
 * luminance; doubles with each stop more exposure.
 */
export function pictureValue(luminance: number, fNumber: number, seconds: number, iso: number, k = METER_K): number {
  positive('f-number, shutter time, ISO and K', fNumber, seconds, iso, k);
  if (!(luminance >= 0)) throw new RangeError('luminance must not be negative');
  return (MID_GREY * luminance * iso * seconds) / (k * fNumber * fNumber);
}

// Shutter angle: the open part of a rotating shutter, as an angle of the full
// 360-degree turn that takes one frame. 360 degrees = the whole frame time.

/** Exposure time (s) of a shutter angle (degrees) at a frame rate (fps). */
export function shutterTimeFromAngle(angleDeg: number, fps: number): number {
  if (!(angleDeg > 0 && angleDeg <= 360)) throw new RangeError('shutter angle must be above 0 and at most 360 degrees');
  positive('frame rate', fps);
  return angleDeg / 360 / fps;
}

/** Shutter angle (degrees) of an exposure time at a frame rate; above 360 means the time is longer than a frame. */
export function shutterAngleFromTime(seconds: number, fps: number): number {
  positive('shutter time and frame rate', seconds, fps);
  return 360 * seconds * fps;
}
