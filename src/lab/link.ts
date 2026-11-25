import type { Setup } from '../setup/types.ts';
import { decodeLink, encodeLink } from '../storage/link.ts';
import { sanitizeLab } from '../storage/sanitize.ts';
import type { LabLightEdit, LabState } from '../storage/schema.ts';

// Lab share links: the camera setup (the viewfinder's link fields) plus the
// lab's own, after "#", e.g.
//   lab/#v=1&mode=cinema&cam=arri/alexa-35&...&lab=1&set=studio&sub=figure&lt=three-point&n=2.8&...
// Like the viewfinder's links, the part after "#" never reaches a server.
// Viewer preferences (aids, quality) are not part of a link.

const enc = (v: string | number) =>
  encodeURIComponent(String(v)).replace(/%2F/g, '/').replace(/%3A/g, ':').replace(/%2C/g, ',');
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r6 = (v: number) => Number(v.toPrecision(6));

/** "key:1,0.667,0.5,3200,-1.2,2;fill:0" (on, stops, size, kelvin, x, z; empty = unchanged). */
function lightsText(lights: Record<string, LabLightEdit>): string {
  return Object.entries(lights)
    .map(([id, e]) => {
      const f = [
        e.on === undefined ? '' : e.on ? 1 : 0,
        e.stops === undefined ? '' : r3(e.stops),
        e.size ?? '',
        e.kelvin ?? '',
        e.x ?? '',
        e.z ?? '',
      ];
      while (f.length && f.at(-1) === '') f.pop();
      return `${id}:${f.join(',')}`;
    })
    .join(';');
}

function parseLights(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const part of text.split(';').slice(0, 12)) {
    const [id, fields = ''] = part.split(':');
    if (!id) continue;
    const [on, stops, size, kelvin, x, z] = fields.split(',');
    const edit: Record<string, unknown> = {};
    if (on === '1' || on === '0') edit.on = on === '1';
    if (stops) edit.stops = stops;
    if (size) edit.size = size;
    if (kelvin) edit.kelvin = kelvin;
    if (x) edit.x = x;
    if (z) edit.z = z;
    out[id] = edit;
  }
  return out;
}

export function encodeLabLink(setup: Setup, s: LabState): string {
  const e = s.exposure;
  const parts: [string, string | number][] = [
    ['lab', 1],
    ['set', s.set],
    ['sub', s.subject],
    ['lt', s.lighting],
    ['n', r3(e.fNumber)],
    ['t', r6(e.shutter)],
    ['ang', e.angle],
    ['fps', e.fps],
    ['iso', e.iso],
    ['wb', e.kelvin],
    ['f', s.focus],
    ['amb', r3(s.ambient)],
  ];
  if (s.camera) parts.push(['cx', s.camera.x], ['cz', s.camera.z]);
  const lights = lightsText(s.lights);
  if (lights) parts.push(['li', lights]);
  return `${encodeLink(setup)}&${parts.map(([k, v]) => `${k}=${enc(v)}`).join('&')}`;
}

export interface DecodedLabLink {
  setup: Setup;
  state: LabState;
  unknownCamera: boolean;
}

/** Reads a lab link's fragment. Null when it is not a CapXer lab link. */
export function decodeLabLink(hash: string, now = new Date()): DecodedLabLink | null {
  const base = decodeLink(hash);
  if (!base) return null;
  const p = new Map<string, string>();
  for (const pair of hash.replace(/^#/, '').split('&')) {
    const i = pair.indexOf('=');
    if (i < 1) continue;
    try {
      p.set(pair.slice(0, i), decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' ')));
    } catch {
      // Broken escape: ignore this value.
    }
  }
  if (p.get('lab') !== '1') return null;
  const focus = p.get('f');
  const state = sanitizeLab(
    {
      set: p.get('set'),
      subject: p.get('sub'),
      lighting: p.get('lt'),
      exposure: {
        fNumber: p.get('n'),
        shutter: p.get('t'),
        angle: p.get('ang'),
        fps: p.get('fps'),
        iso: p.get('iso'),
        kelvin: p.get('wb'),
      },
      focus,
      lights: parseLights(p.get('li') ?? ''),
      ambient: p.get('amb'),
      camera: p.has('cx') && p.has('cz') ? { x: p.get('cx'), z: p.get('cz') } : null,
      changedAt: now.toISOString(),
    },
    now,
  )!;
  // A link never carries a custom camera into the lab (the lab uses the camera database).
  return { setup: base.setup, state, unknownCamera: base.unknownCamera || !!base.custom };
}
