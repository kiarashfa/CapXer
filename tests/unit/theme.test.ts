import { describe, expect, it } from 'vitest';
import { resolveTheme } from '../../src/lib/theme.ts';

describe('resolveTheme', () => {
  it('uses a stored choice first', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('follows a light system preference, otherwise defaults to dark', () => {
    expect(resolveTheme(null, true)).toBe('light');
    expect(resolveTheme(null, false)).toBe('dark');
    expect(resolveTheme('garbage', false)).toBe('dark');
  });
});
