// The static scene the viewfinder looks at when there is no camera.
// Drawn in "tangent space": a point at lateral x, height y and distance z
// (metres) projects to X = x / z, Y = -(y - eye) / z for a level rectilinear
// lens. A lens of focal f on an image w mm wide then sees X in
// [-w / (2f), w / (2f)], so the SVG viewBox alone does the framing and every
// focal length crops the scene exactly as a real lens would.

export const EYE_HEIGHT = 1.6;
/** The scene is drawn out to 65 degrees either side (130 degrees across). */
export const SCENE_HALF_WIDTH = Math.tan((65 * Math.PI) / 180);

export interface ScenePoint {
  X: number;
  Y: number;
}

export function project(x: number, y: number, z: number, eye = EYE_HEIGHT): ScenePoint {
  return { X: x / z, Y: -(y - eye) / z };
}

const f = (n: number) => Math.round(n * 100000) / 100000;
const pathOf = (pts: ScenePoint[], close = false) =>
  'M' + pts.map((p) => `${f(p.X)} ${f(p.Y)}`).join(' L') + (close ? ' Z' : '');

/** A standing person: body as a rounded column, head as a circle. */
function person(x: number, z: number, height = 1.75) {
  const half = 0.23;
  const shoulder = height * 0.82;
  const body = pathOf([project(x - half, 0, z), project(x - half, shoulder - 0.1, z), project(x - half + 0.08, shoulder, z),
    project(x + half - 0.08, shoulder, z), project(x + half, shoulder - 0.1, z), project(x + half, 0, z)], true);
  const head = project(x, height - 0.12, z);
  return { body, head: { cx: f(head.X), cy: f(head.Y), r: f(0.12 / z) } };
}

function hills(): string {
  const z = 600;
  const pts: ScenePoint[] = [];
  for (let x = -2000; x <= 2000; x += 40) {
    const h = 32 + 18 * Math.sin(x / 260) + 9 * Math.sin(x / 90 + 1);
    pts.push(project(x, h, z));
  }
  return pathOf(pts);
}

export const SCENE_CAPTION = 'Scene: a person 1.75 m tall at 4 m, camera at 1.6 m eye height';

/** Precomputed scene shapes in tangent space (stroke-only line drawing). */
export const SCENE = (() => {
  const near = person(0.7, 4);
  const far = person(-2.4, 12);
  const tree = { trunk: pathOf([project(-8.2, 0, 22), project(-8.2, 3, 22), project(-7.8, 3, 22), project(-7.8, 0, 22)], true), crown: project(-8, 5.2, 22) };
  const house = [project(7, 0, 35), project(7, 4, 35), project(10.5, 6.6, 35), project(14, 4, 35), project(14, 0, 35)];
  const road = [
    pathOf([project(-1.6, 0, 1.8), project(-1.6, 0, 400)]),
    pathOf([project(1.6, 0, 1.8), project(1.6, 0, 400)]),
  ];
  const sun = { cx: 1.0, cy: -0.42, r: 0.05 };
  return {
    paths: [hills(), ...road, pathOf(house, true), tree.trunk, near.body, far.body],
    circles: [sun, near.head, far.head, { cx: f(tree.crown.X), cy: f(tree.crown.Y), r: f(2.2 / 22) }],
  };
})();

/** viewBox (tangent space) for an image of the given desqueezed size and focal length. */
export function viewBoxFor(widthMm: number, heightMm: number, focal: number): string {
  const hw = widthMm / (2 * focal);
  const hh = heightMm / (2 * focal);
  return `${f(-hw)} ${f(-hh)} ${f(2 * hw)} ${f(2 * hh)}`;
}
