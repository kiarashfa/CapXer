// Geometry of the lab's top view (the "studio plan"). Pure, unit-tested.
// Plan coordinates are the set's x and z in metres (z grows towards the camera,
// which is down on the page).

export interface P2 {
  x: number;
  z: number;
}

export interface Wedge {
  /** Unit vector of the camera's optical axis on the floor. */
  axis: P2;
  /** Unit vector across it, to the camera's right. */
  across: P2;
}

/** Direction from the camera to the point it looks at, and the direction across it. */
export function viewWedge(camera: P2, target: P2): Wedge {
  const dx = target.x - camera.x;
  const dz = target.z - camera.z;
  const len = Math.hypot(dx, dz) || 1;
  const axis = { x: dx / len, z: dz / len };
  return { axis, across: { x: -axis.z, z: axis.x } };
}

/** Point at `along` metres down the axis and `side` metres across it. */
export function at(camera: P2, w: Wedge, along: number, side: number): P2 {
  return {
    x: camera.x + w.axis.x * along + w.across.x * side,
    z: camera.z + w.axis.z * along + w.across.z * side,
  };
}

/**
 * The floor area that is in focus: between the near and far limits (measured
 * along the axis) and inside the lens's horizontal angle (tanW = tan of half
 * of it). `far` may be Infinity; it is cut at `maxAlong`.
 */
export function sharpBand(
  camera: P2,
  w: Wedge,
  tanW: number,
  near: number,
  far: number,
  maxAlong: number,
): P2[] {
  const f = Math.min(far, maxAlong);
  const n = Math.min(near, f);
  return [
    at(camera, w, n, -n * tanW),
    at(camera, w, n, n * tanW),
    at(camera, w, f, f * tanW),
    at(camera, w, f, -f * tanW),
  ];
}

/** How far along the axis the background wall (z = wallZ) is; Infinity if the camera looks away from it. */
export function alongToWall(camera: P2, w: Wedge, wallZ: number): number {
  if (w.axis.z >= -1e-6) return Infinity;
  return (wallZ - camera.z) / w.axis.z;
}

/** A light's beam on the floor plan: a triangle from the light towards its aim, `halfAngle` degrees each side. */
export function beam(light: P2, aim: P2, halfAngleDeg: number, length: number): P2[] {
  const w = viewWedge(light, aim);
  const s = Math.tan((halfAngleDeg * Math.PI) / 180) * length;
  return [light, at(light, w, length, -s), at(light, w, length, s)];
}

/** "x,z x,z ..." for an SVG polygon, in plan units (centimetres). */
export function points(list: P2[], unit = 100): string {
  return list.map((p) => `${(p.x * unit).toFixed(1)},${(p.z * unit).toFixed(1)}`).join(' ');
}
