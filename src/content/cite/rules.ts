// The citation rule for lessons, in one place so it can be tuned after real
// lesson writing (owner, 2026-11-20: may be loosened once we see the challenges).

export interface CitationRules {
  /** Every paragraph (including list items, blockquotes and figure captions) needs a citation. */
  paragraphs: boolean;
  /** Every table needs at least one citation somewhere in its cells. */
  tables: boolean;
  /** MDX blocks whose contents are not factual claims: instructions and opinion. Rendered visibly. */
  exempt: string[];
  /**
   * true: a missing citation fails the build. false: it is printed as a warning.
   * Unknown keys and missing or unknown locators always fail.
   */
  strict: boolean;
}

export const RULES: CitationRules = {
  paragraphs: true,
  tables: true,
  exempt: ['Try', 'OurView'],
  strict: true,
};
