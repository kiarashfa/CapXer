// Overlay geometry as fractions (0-1) of the displayed image area, so the same
// numbers drive the on-screen overlay and, in P4, the photo-capture drawer.
// The frame is centred in the area (as fitAspect fits it).

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface OverlayGuides {
  thirds: boolean;
  golden: boolean;
  centre: boolean;
  safe: boolean;
}

export interface Overlay {
  frame: Box;
  /** Up to four bands outside the frame. */
  masks: Box[];
  lines: Line[];
  centre?: { x: number; y: number };
  safe?: { action: Box; graphics: Box };
}

/** Golden ratio split: 1 / phi = 0.618... */
const PHI_INV = 2 / (1 + Math.sqrt(5));

export function inset(box: Box, margin: number): Box {
  return { x: box.x + box.w * margin, y: box.y + box.h * margin, w: box.w * (1 - 2 * margin), h: box.h * (1 - 2 * margin) };
}

export function overlayGeometry(
  frameFraction: { w: number; h: number },
  guides: OverlayGuides,
  safeMargins: { action: number; graphics: number },
): Overlay {
  const w = Math.min(1, frameFraction.w);
  const h = Math.min(1, frameFraction.h);
  const frame: Box = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };

  const masks: Box[] = [];
  if (frame.y > 1e-6) masks.push({ x: 0, y: 0, w: 1, h: frame.y }, { x: 0, y: frame.y + h, w: 1, h: frame.y });
  if (frame.x > 1e-6) masks.push({ x: 0, y: frame.y, w: frame.x, h }, { x: frame.x + w, y: frame.y, w: frame.x, h });

  const lines: Line[] = [];
  const split = (a: number) => {
    lines.push({ x1: frame.x + w * a, y1: frame.y, x2: frame.x + w * a, y2: frame.y + h });
    lines.push({ x1: frame.x, y1: frame.y + h * a, x2: frame.x + w, y2: frame.y + h * a });
  };
  if (guides.thirds) [1 / 3, 2 / 3].forEach(split);
  if (guides.golden) [1 - PHI_INV, PHI_INV].forEach(split);

  return {
    frame,
    masks,
    lines,
    centre: guides.centre ? { x: frame.x + w / 2, y: frame.y + h / 2 } : undefined,
    safe: guides.safe ? { action: inset(frame, safeMargins.action), graphics: inset(frame, safeMargins.graphics) } : undefined,
  };
}
