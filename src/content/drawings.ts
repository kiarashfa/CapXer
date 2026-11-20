// The drawing components a lesson figure can use, and how the Lessons page finds a
// lesson's first drawing for its card. Props are written as JSON in the MDX
// (ratios={[1.375, 1.85]} labels={["1.37:1", "1.85:1"]}), so they can be read here
// without running the MDX. tests/unit/lessons.test.ts checks every lesson has one.

export const DRAWINGS = ['RatioFrames'] as const;
export type DrawingName = (typeof DRAWINGS)[number];

export interface Drawing {
  name: DrawingName;
  props: Record<string, unknown>;
}

const TAG = new RegExp(`<(${DRAWINGS.join('|')})\\b([^>]*?)/>`);
const PROP = /(\w+)=\{([\s\S]*?)\}(?=\s+\w+=|\s*$)/g;

/** The first drawing in a lesson's MDX body, or null. Throws on props that are not JSON. */
export function firstDrawing(body: string): Drawing | null {
  const m = TAG.exec(body);
  if (!m) return null;
  const props: Record<string, unknown> = {};
  for (const [, key, value] of m[2].trim().matchAll(PROP)) {
    try {
      props[key] = JSON.parse(value);
    } catch {
      throw new Error(`<${m[1]}> prop ${key} must be plain JSON (numbers, strings, arrays), got {${value}}`);
    }
  }
  return { name: m[1] as DrawingName, props };
}
