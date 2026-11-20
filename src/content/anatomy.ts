// The fixed shape every lesson follows, so lessons read as one series no matter
// who writes them. Enforced by tests/unit/lessons.test.ts (runs in CI).
// Derived from the first lesson, "Aspect ratios". Change here, not per lesson.

export const ANATOMY = {
  /** Body words, excluding front matter, citation markers and component tags. */
  words: { min: 1100, max: 1900 },
  /** Number of `## ` sections. The first defines the subject; the last holds only the <OurView>. */
  sections: { min: 5, max: 8 },
  /** Section titles are listed in the "On this page" menu; keep them short. */
  headingMaxWords: 6,
  figures: { min: 1, max: 2 },
  /** Each <Try> holds at least one <TryLink>. */
  tries: { min: 1, max: 3 },
  ourView: 1,
} as const;
