import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import { DEFAULT_SITE_ORIGIN, resolveSiteUrl } from '../../scripts/siteOrigin';

/**
 * Tests for `scripts/siteOrigin.js`, the one place the site build learns
 * where it will be served from (#588).
 *
 * Before it, `https://maidr.ai/` was spelled out in the build script, the
 * page template, the TypeDoc plugin and the navbar pass -- so a local
 * preview declared itself canonical at the production site, a staging deploy
 * pointed search engines back at production, and a fork could not build for
 * its own domain without editing four files. The second `describe` is the
 * guard against that coming back one literal at a time: the files that write
 * absolute URLs into the site may not name the production origin themselves.
 *
 * It runs in the `esm` project because the module under test is ESM -- the
 * repo is `"type": "module"` -- and the CommonJS project cannot require it,
 * the same arrangement as `siteSeo.esm-test.ts`.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('resolveSiteUrl', () => {
  it('should default to the production site', () => {
    expect(resolveSiteUrl(undefined)).toBe('https://maidr.ai/');
    expect(resolveSiteUrl('')).toBe('https://maidr.ai/');
    expect(resolveSiteUrl('   ')).toBe('https://maidr.ai/');
    expect(resolveSiteUrl(DEFAULT_SITE_ORIGIN)).toBe('https://maidr.ai/');
  });

  it('should end in a slash whether or not the origin did', () => {
    // Every caller appends a path directly, so the slash has to be there.
    expect(resolveSiteUrl('http://localhost:3000')).toBe('http://localhost:3000/');
    expect(resolveSiteUrl('http://localhost:3000/')).toBe('http://localhost:3000/');
    expect(resolveSiteUrl('https://staging.maidr.ai')).toBe('https://staging.maidr.ai/');
  });

  it('should keep a path under the origin, for a site served from a subdirectory', () => {
    expect(resolveSiteUrl('https://example.github.io/maidr')).toBe('https://example.github.io/maidr/');
    expect(resolveSiteUrl('https://example.github.io/maidr/')).toBe('https://example.github.io/maidr/');
  });

  it('should drop a query or fragment, which no page URL should inherit', () => {
    expect(resolveSiteUrl('https://example.test/?utm=1#top')).toBe('https://example.test/');
  });

  it('should refuse anything that is not an absolute http(s) URL', () => {
    // A bad value must fail the build, not become the canonical on every page.
    expect(() => resolveSiteUrl('maidr.ai')).toThrow(/SITE_ORIGIN/);
    expect(() => resolveSiteUrl('/docs')).toThrow(/SITE_ORIGIN/);
    expect(() => resolveSiteUrl('ftp://maidr.ai')).toThrow(/http or https/);
  });
});

describe('the site build names its origin in one place', () => {
  /** The files that write absolute site URLs, none of which may spell one. */
  const WRITERS = [
    'scripts/build-site.js',
    'scripts/typedoc-seo-plugin.mjs',
    'scripts/add-navbar-to-typedoc.js',
    'docs/template.html',
    'docs/robots.txt',
  ];

  it.each(WRITERS)('%s does not hard-code the production origin', (file) => {
    const source = readFileSync(resolve(ROOT, file), 'utf-8');
    // `py.maidr.ai` and `r.maidr.ai` are other sites and stay literal.
    expect(source).not.toMatch(/https?:\/\/maidr\.ai/);
  });

  it('keeps the default itself in scripts/siteOrigin.js', () => {
    expect(DEFAULT_SITE_ORIGIN).toBe('https://maidr.ai');
  });
});
