import { getSensor } from '../data/index.ts';
import type { CustomSensor, Setup } from '../setup/types.ts';
import { cleanName, sanitizeCustom, sanitizeSetup } from './sanitize.ts';

// Share links: the whole setup as readable values after "#", e.g.
//   viewfinder/#v=1&mode=cinema&cam=arri/alexa-35&fmt=4k-16-9&ar=2.39&mm=35&...
// The part after "#" never leaves the browser (no server sees it), and
// analytics only ever gets the page path. Every field is written, not only the
// changed ones, so a link keeps its meaning if defaults change later.
// A custom camera travels inside the link (name and size).

export const LINK_VERSION = 1;
const GUIDES = ['thirds', 'golden', 'centre', 'safe'] as const;

/** Encodes like encodeURIComponent but keeps / : , readable (all allowed in a fragment). */
const enc = (v: string | number) =>
  encodeURIComponent(String(v)).replace(/%2F/g, '/').replace(/%3A/g, ':').replace(/%2C/g, ',');

export function encodeLink(setup: Setup, custom?: CustomSensor): string {
  const parts: [string, string | number][] = [
    ['v', LINK_VERSION],
    ['mode', setup.mode],
  ];
  if (custom)
    parts.push(
      ['cam', 'custom'],
      ['cn', custom.name],
      ['cw', custom.width],
      ['ch', custom.height],
      ['csq', custom.squeeze],
    );
  else parts.push(['cam', setup.sensorId], ['fmt', setup.formatId]);
  parts.push(
    ['ar', setup.aspect],
    ['sq', setup.squeeze],
    ['mm', setup.focal],
    ['entry', setup.focalEntry],
    ['g', GUIDES.filter((g) => setup.guides[g]).join(',')],
    ['col', setup.frameColor],
    ['mask', setup.mask],
    ['d', setup.distance],
  );
  return parts.map(([k, v]) => `${k}=${enc(v)}`).join('&');
}

export interface DecodedLink {
  setup: Setup;
  /** The link's own camera, when it carries one (its id is a placeholder until the caller stores it). */
  custom?: CustomSensor;
  /** The link names a camera this version of CapXer does not have; the default is shown. */
  unknownCamera: boolean;
}

const PLACEHOLDER = 'custom/link';

/** Reads a share link's fragment ("#v=1&..." or "v=1&..."). Null when it is not a CapXer setup link. */
export function decodeLink(hash: string): DecodedLink | null {
  const text = hash.replace(/^#/, '');
  if (!/(^|&)v=\d/.test(text)) return null;
  const p = new Map<string, string>();
  for (const pair of text.split('&')) {
    const i = pair.indexOf('=');
    if (i < 1) continue;
    try {
      p.set(pair.slice(0, i), decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' ')));
    } catch {
      // Broken escape: ignore this value.
    }
  }
  if (Number(p.get('v')) !== LINK_VERSION) return null;

  let custom: CustomSensor | undefined;
  const cam = p.get('cam') ?? '';
  if (cam === 'custom') {
    custom =
      sanitizeCustom({
        id: PLACEHOLDER,
        name: cleanName(p.get('cn'), 'Shared sensor'),
        width: p.get('cw'),
        height: p.get('ch'),
        squeeze: p.get('csq'),
      }) ?? undefined;
  }
  const g = new Set((p.get('g') ?? '').split(','));
  const raw = {
    mode: p.get('mode'),
    sensorId: custom ? PLACEHOLDER : cam,
    formatId: custom ? 'custom' : p.get('fmt'),
    aspect: p.get('ar'),
    squeeze: p.get('sq'),
    focal: p.get('mm'),
    focalEntry: p.get('entry'),
    guides: p.has('g') ? Object.fromEntries(GUIDES.map((k) => [k, g.has(k)])) : undefined,
    frameColor: p.get('col'),
    mask: p.get('mask'),
    distance: p.get('d'),
  };
  const setup = sanitizeSetup(raw, custom ? [custom] : []);
  const unknownCamera = cam === 'custom' ? !custom : !getSensor(cam);
  return { setup, custom, unknownCamera };
}
