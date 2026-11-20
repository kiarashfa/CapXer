// Lesson topics, in the order the Lessons page lists them. Display names live in src/i18n/en.ts.
export const TOPICS = {
  framing: { order: 1 },
} as const;

export type Topic = keyof typeof TOPICS;
