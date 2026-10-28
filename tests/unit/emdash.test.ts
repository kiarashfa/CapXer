import { describe, expect, it } from 'vitest';
import { findEmDashes } from '../../scripts/emdash.ts';

const EM = '—';

describe('findEmDashes', () => {
  it('finds the character and its escaped spellings', () => {
    expect(findEmDashes(`a ${EM} b`)).toHaveLength(1);
    expect(findEmDashes('a &mdash; b &#8212; c')).toHaveLength(2);
    expect(findEmDashes("const s = 'a \\u2014 b';", { code: true })).toHaveLength(1);
  });

  it('allows en-dashes and hyphens', () => {
    expect(findEmDashes('1900–1920, well-known')).toHaveLength(0);
  });

  it('reports line and column', () => {
    expect(findEmDashes(`ok\nnot ${EM} ok`)[0]).toMatchObject({ line: 2, col: 5 });
  });

  it('ignores comments in code files but not strings', () => {
    const src = [
      `// line comment ${EM} fine`,
      `/* block ${EM}`,
      `   comment */`,
      `<!-- html ${EM} comment -->`,
      `const u = 'https://example.com'; // ${EM} fine`,
      `const s = 'copy ${EM} not fine';`,
    ].join('\n');
    const hits = findEmDashes(src, { code: true });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.line).toBe(6);
  });

  it('checks comments too in prose files', () => {
    expect(findEmDashes(`<!-- ${EM} -->`)).toHaveLength(1);
  });
});
