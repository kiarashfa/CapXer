// How the lab writes its numbers. Pure, unit-tested.

/** 1/50 s, 1/8 s, 0.5 s, 2 s. Fractions use the nearest whole denominator. */
export function formatShutter(seconds: number): string {
  if (seconds >= 1) return `${Number(seconds.toFixed(1))} s`;
  const den = 1 / seconds;
  if (Math.abs(den - Math.round(den)) < 0.05 || den >= 3) return `1/${Math.round(den)} s`;
  return `${Number(seconds.toFixed(2))} s`;
}

/** f/2.8, f/11, f/1.4 (one decimal below 10, whole numbers from 10). */
export function formatAperture(n: number): string {
  return `f/${n >= 10 ? Math.round(n) : Number(n.toFixed(1))}`;
}

/** Metres with one decimal, or "infinity". */
export function formatMetres(m: number): string {
  return Number.isFinite(m) ? `${m.toFixed(1)} m` : 'infinity';
}

/** +0.7, -1.3, 0.0 (with a real minus sign). */
export function formatStops(stops: number): string {
  const r = Math.round(stops * 10) / 10;
  if (r === 0) return '0.0';
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)}`;
}
