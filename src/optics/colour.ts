import type { Citation } from '../data/index.ts';

// Colour of light by temperature, for the lab's white balance. Pure, unit-tested.
//
// - A light "at 3200 K" is treated as a blackbody (Planck's law). Relative
//   spectral radiance: lambda^-5 / (exp(c2 / (lambda T)) - 1), with the second
//   radiation constant c2 = 1.438 776 877e-2 m K (exact, 2022 CODATA).
// - The spectrum is turned into CIE 1931 XYZ with the multi-lobe analytic fit
//   of the colour-matching functions by Wyman, Sloan and Shirley (2013),
//   Eq. 4 and Table 1, summed every 1 nm from 380 to 780 nm.
// - XYZ to linear RGB uses the BT.709 primaries and D65 white (ITU-R BT.709-6,
//   items 1.3 and 1.4); the matrix is computed from them below, not typed in.
// Results are normalised to luminance Y = 1, so a light's colour never changes
// its brightness. Real lamps are not perfect blackbodies; that is ignored.

export const CMF_SOURCE: Citation = { ref: 'wyman-sloan-shirley-2013-cmf', locator: 'Sec. 2.2, Eq. 4, Table 1' };
export const C2_SOURCE: Citation = { ref: 'nist-codata-2022-second-radiation-constant', locator: 'Value' };
export const PRIMARIES_SOURCE: Citation = { ref: 'itu-r-bt709-6', locator: 'Items 1.3 and 1.4' };

/** Second radiation constant, m K (2022 CODATA, exact). */
export const C2 = 1.438776877e-2;

/** BT.709 chromaticities (x, y): red, green, blue and the D65 white. */
export const BT709_PRIMARIES = { r: [0.64, 0.33], g: [0.3, 0.6], b: [0.15, 0.06], white: [0.3127, 0.329] } as const;

export type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

// Wyman, Sloan and Shirley 2013, Table 1: alpha, beta, gamma, delta per lobe.
const LOBES = {
  x: [
    [0.362, 442.0, 0.0624, 0.0374],
    [1.056, 599.8, 0.0264, 0.0323],
    [-0.065, 501.1, 0.049, 0.0382],
  ],
  y: [
    [0.821, 568.8, 0.0213, 0.0247],
    [0.286, 530.9, 0.0613, 0.0322],
  ],
  z: [
    [1.217, 437.0, 0.0845, 0.0278],
    [0.681, 459.0, 0.0385, 0.0725],
  ],
} as const;

function lobes(list: readonly (readonly number[])[], wave: number): number {
  let sum = 0;
  for (const [a, b, g, d] of list) {
    const t = (wave - b!) * (wave < b! ? g! : d!);
    sum += a! * Math.exp(-0.5 * t * t);
  }
  return sum;
}

/** CIE 1931 colour-matching functions at a wavelength in nm (analytic fit). */
export function cmf1931(waveNm: number): Vec3 {
  return [lobes(LOBES.x, waveNm), lobes(LOBES.y, waveNm), lobes(LOBES.z, waveNm)];
}

/** Relative spectral radiance of a blackbody (any constant factor dropped). */
export function planck(waveNm: number, kelvin: number): number {
  const l = waveNm * 1e-9;
  return 1 / (l ** 5 * (Math.exp(C2 / (l * kelvin)) - 1));
}

/** XYZ of a blackbody at `kelvin`, scaled to Y = 1. */
export function blackbodyXYZ(kelvin: number): Vec3 {
  if (!(kelvin > 0)) throw new RangeError('temperature must be positive');
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let w = 380; w <= 780; w++) {
    const p = planck(w, kelvin);
    const [x, y, z] = cmf1931(w);
    X += p * x;
    Y += p * y;
    Z += p * z;
  }
  return [X / Y, 1, Z / Y];
}

const xyToXYZ = ([x, y]: readonly [number, number] | readonly number[]): Vec3 => [x! / y!, 1, (1 - x! - y!) / y!];

function invert3([[a, b, c], [d, e, f], [g, h, i]]: Mat3): Mat3 {
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

const mul = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

/** Linear RGB (BT.709 primaries, D65 white) to XYZ, built from the chromaticities. */
export function rgbToXyzMatrix(p = BT709_PRIMARIES): Mat3 {
  const r = xyToXYZ(p.r);
  const g = xyToXYZ(p.g);
  const b = xyToXYZ(p.b);
  const cols: Mat3 = [
    [r[0], g[0], b[0]],
    [r[1], g[1], b[1]],
    [r[2], g[2], b[2]],
  ];
  // Scale each primary so that R = G = B = 1 gives the white point.
  const s = mul(invert3(cols), xyToXYZ(p.white));
  return [
    [cols[0][0] * s[0], cols[0][1] * s[1], cols[0][2] * s[2]],
    [cols[1][0] * s[0], cols[1][1] * s[1], cols[1][2] * s[2]],
    [cols[2][0] * s[0], cols[2][1] * s[1], cols[2][2] * s[2]],
  ];
}

const XYZ_TO_RGB = invert3(rgbToXyzMatrix());

/** XYZ to linear BT.709 RGB. */
export function xyzToRgb(xyz: Vec3): Vec3 {
  return mul(XYZ_TO_RGB, xyz);
}

/** Linear RGB colour of light at `kelvin`, luminance 1 (negative parts, outside the RGB gamut, set to 0). */
export function kelvinToRgb(kelvin: number): Vec3 {
  const [r, g, b] = xyzToRgb(blackbodyXYZ(kelvin));
  return [Math.max(0, r), Math.max(0, g), Math.max(0, b)];
}

/**
 * Camera white balance: per-channel gains that turn light at `kelvin` into
 * neutral grey of the same luminance (like a camera's white balance setting).
 */
export function whiteBalanceGains(kelvin: number): Vec3 {
  const [r, g, b] = kelvinToRgb(kelvin);
  return [1 / Math.max(r, 1e-4), 1 / Math.max(g, 1e-4), 1 / Math.max(b, 1e-4)];
}
