import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { policyFor, withPolicy } from '../../scripts/build-csp.ts';

const sha = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;
const page = (body: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>x</title></head><body>${body}</body></html>`;

describe('build-csp', () => {
  it('hashes every inline script and skips external ones', () => {
    const p = policyFor(page('<script>a()</script><script type="module" src="/x.js"></script><script is:inline>b()</script>'));
    expect(p).toContain(sha('a()'));
    expect(p).toContain(sha('b()'));
    expect(p).not.toContain("'unsafe-inline' 'sha");
    expect(p.match(/'sha256-/g)).toHaveLength(2);
  });

  it('keeps script-src strict and blocks plugins', () => {
    const p = policyFor(page(''));
    expect(p).toMatch(/script-src 'self' https:\/\/www\.googletagmanager\.com(;|$)/);
    expect(p).toContain("object-src 'none'");
    expect(p).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  });

  it('puts the tag right after <meta charset>, before any script', () => {
    const out = withPolicy(page('<script>a()</script>'));
    expect(out.indexOf('content-security-policy')).toBeLessThan(out.indexOf('<script'));
    expect(out).toMatch(/^<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="content-security-policy"/);
    expect(() => withPolicy(out)).toThrow(/already/);
  });
});
