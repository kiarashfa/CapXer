// Where moved things may stand. Pure, unit-tested.

/** Keep things in the room, in front of the wall and clear of the subject. */
export function clampPlace(room: { width: number; depth: number; wallZ: number }, x: number, z: number, minFromSubject: number): { x: number; z: number } {
  const margin = 0.2;
  let cx = Math.max(-room.width / 2 + margin, Math.min(room.width / 2 - margin, x));
  let cz = Math.max(room.wallZ + margin, Math.min(room.wallZ + room.depth - margin, z));
  const d = Math.hypot(cx, cz);
  if (d < minFromSubject) {
    if (d > 1e-6) {
      cx = (cx * minFromSubject) / d;
      cz = (cz * minFromSubject) / d;
    } else {
      cx = 0;
      cz = minFromSubject;
    }
  }
  return { x: cx, z: cz };
}
