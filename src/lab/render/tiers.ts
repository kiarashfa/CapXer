// Quality tiers for the lab's renderer. Our own numbers, from the L0 spike on
// an integrated GPU (Intel Iris Xe: about 4 ms per sample at 1280 x 720 for a
// scene heavier than the studio).

export type Tier = 'low' | 'medium' | 'high';
export const TIER_ORDER: Tier[] = ['low', 'medium', 'high'];

export interface TierSettings {
  /** Render size as a share of the picture's on-screen pixels. */
  scale: number;
  /** Samples averaged for the finished picture. */
  samples: number;
  /** Shadow map size, pixels. */
  shadow: number;
}

export const TIERS: Record<Tier, TierSettings> = {
  low: { scale: 0.5, samples: 32, shadow: 1024 },
  medium: { scale: 0.75, samples: 64, shadow: 2048 },
  high: { scale: 1, samples: 128, shadow: 2048 },
};

/** Software renderers (no graphics chip) start low; everything else medium. */
export function initialTier(rendererName: string): Tier {
  return /swiftshader|llvmpipe|software|basic render/i.test(rendererName) ? 'low' : 'medium';
}

/** One tier lower when a single sample takes too long (the picture would take over 2 s). */
export function tierAfter(tier: Tier, msPerSample: number): Tier {
  const settings = TIERS[tier];
  if (tier !== 'low' && msPerSample * settings.samples > 2000) return TIER_ORDER[TIER_ORDER.indexOf(tier) - 1]!;
  return tier;
}

/** Most samples drawn in one frame. */
export const MAX_PER_FRAME = 8;

/**
 * Samples to draw in the next frame, from the time between the last two
 * frames. While frames keep the screen's pace (under 20 ms, about 60 Hz) one
 * more sample fits; when a frame runs slow (over 28 ms) draw fewer, so the
 * page stays smooth while the picture builds up.
 */
export function nextPerFrame(perFrame: number, frameMs: number): number {
  if (!(frameMs > 0)) return perFrame;
  if (frameMs < 20) return Math.min(MAX_PER_FRAME, perFrame + 1);
  if (frameMs > 28) return Math.max(1, Math.floor(perFrame * 0.7));
  return perFrame;
}
