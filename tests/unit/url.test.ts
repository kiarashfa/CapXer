import { describe, expect, it } from 'vitest';
import { url } from '../../src/lib/url.ts';

describe('url', () => {
  it('returns the base for the home page', () => {
    expect(url()).toBe('/CapXer/');
    expect(url('/')).toBe('/CapXer/');
  });

  it('adds a trailing slash to page paths', () => {
    expect(url('about')).toBe('/CapXer/about/');
    expect(url('/about')).toBe('/CapXer/about/');
    expect(url('lessons/aspect-ratios/')).toBe('/CapXer/lessons/aspect-ratios/');
  });

  it('leaves file paths alone', () => {
    expect(url('favicon.svg')).toBe('/CapXer/favicon.svg');
    expect(url('/data/sensors.json')).toBe('/CapXer/data/sensors.json');
  });

  it('keeps query strings and hashes after the slash', () => {
    expect(url('viewfinder?s=abc')).toBe('/CapXer/viewfinder/?s=abc');
    expect(url('about#credits')).toBe('/CapXer/about/#credits');
    expect(url('#main')).toBe('/CapXer/#main');
  });

  it('works for a root deployment (custom domain)', () => {
    expect(url('', '/')).toBe('/');
    expect(url('about', '/')).toBe('/about/');
  });
});
