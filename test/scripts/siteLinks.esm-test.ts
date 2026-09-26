import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { renderMarkdown } from '../../scripts/markdown';
import { builtPagePath, INTEGRATION_PAGES, rewriteMarkdownLinks } from '../../scripts/siteLinks';

/**
 * Tests for `scripts/siteLinks.js` — where each markdown source lands on
 * maidr.ai, and the links between them.
 *
 * The same files are read on github.com, where a link names the `.md`, and on
 * the site, where it has to name the page built from it. The build used to
 * rewrite the README's links by hand and nothing else's, so the home page's
 * Plotly link went to `docs/plotly.html` (#1280) and three links between
 * `docs/` pages went to `.md` files the site does not serve (#1281). A missing
 * page is a 404 rather than a silent no-op, but nothing in CI loaded one, so
 * both shipped.
 *
 * The last `describe` is the part that keeps it from coming back: it builds
 * every page's links the way `scripts/build-site.js` does and resolves each
 * one against the pages the build produces, fragment included. It is the
 * cross-page counterpart of `siteAnchors.esm-test.ts`, which checks the
 * `href="#…"` links within a page.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Every markdown source the site builds into a page. */
function markdownSources(): string[] {
  const docs = readdirSync(resolve(ROOT, 'docs'))
    .filter(file => file.endsWith('.md'))
    .sort()
    .map(file => `docs/${file}`);
  return ['README.md', ...docs];
}

/** Render a source the way the build does, links rewritten. */
function renderPage(source: string): string {
  const markdown = readFileSync(resolve(ROOT, source), 'utf-8');
  // The build strips the centred logo div off the top of the README.
  const stripped = markdown.replace(/<div align="center">[\s\S]*?<\/div>\s*/, '');
  return rewriteMarkdownLinks(renderMarkdown(stripped), source);
}

const SOURCES = markdownSources();

/** Site path → source, for every page built from markdown. */
const PAGES = new Map(SOURCES.map(source => [builtPagePath(source) as string, source]));

/**
 * Site paths that exist without being built from markdown here: the gallery,
 * and the API reference TypeDoc writes after this build.
 */
const GENERATED = new Set(['examples.html', 'api/index.html']);

/** Directories the build copies to the site root unchanged. */
const COPIED = ['examples', 'media'];

/** Whether the site will serve something at this path. */
function exists(sitePath: string): boolean {
  if (PAGES.has(sitePath) || GENERATED.has(sitePath)) {
    return true;
  }
  return COPIED.some(dir => sitePath.startsWith(`${dir}/`)) && existsSync(resolve(ROOT, sitePath));
}

const ids = new Map<string, Set<string>>();

/** The element ids on a page built from markdown. */
function idsOn(sitePath: string): Set<string> {
  let found = ids.get(sitePath);
  if (!found) {
    const document = new JSDOM(renderPage(PAGES.get(sitePath) as string)).window.document;
    found = new Set([...document.querySelectorAll('[id]')].map(element => element.id));
    ids.set(sitePath, found);
  }
  return found;
}

/** Links on the page built from `source` that the site would not resolve. */
function deadLinks(source: string): string[] {
  const page = builtPagePath(source) as string;
  const document = new JSDOM(renderPage(source)).window.document;
  const dead: string[] = [];
  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') ?? '';
    // Absolute URLs, and in-page anchors, which siteAnchors checks.
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) {
      continue;
    }
    const [target, fragment] = href.split('#');
    const sitePath = posix.normalize(posix.join(posix.dirname(page), target));
    if (!exists(sitePath)) {
      dead.push(href);
    } else if (fragment && PAGES.has(sitePath) && !idsOn(sitePath).has(decodeURIComponent(fragment))) {
      dead.push(href);
    }
  }
  return dead;
}

describe('the declarations beside the module', () => {
  it('should describe what the module actually returns', () => {
    // `siteLinks.d.ts` is hand-written and `tsc` never sees the JavaScript.
    const page: string | null = builtPagePath('README.md');
    const html: string = rewriteMarkdownLinks('<a href="docs/SCHEMA.md">x</a>', 'README.md');

    expect(page).toBe('index.html');
    expect(html).toBe('<a href="docs/SCHEMA.html">x</a>');
    expect(INTEGRATION_PAGES.map(({ slug }) => slug)).toContain('plotly');
  });
});

describe('builtPagePath', () => {
  it('should put the README at the home page', () => {
    expect(builtPagePath('README.md')).toBe('index.html');
  });

  it('should put an integration guide at the site root', () => {
    expect(builtPagePath('docs/plotly.md')).toBe('plotly.html');
    expect(builtPagePath('docs/google-charts.md')).toBe('google-charts.html');
  });

  it('should put any other docs page beside itself under docs/', () => {
    expect(builtPagePath('docs/CONTROLS.md')).toBe('docs/CONTROLS.html');
  });

  it('should build nothing from markdown outside README.md and docs/', () => {
    expect(builtPagePath('CONTRIBUTING.md')).toBeNull();
    expect(builtPagePath('docs/media/notes.md')).toBeNull();
  });

  it('should know every integration guide by a source that exists', () => {
    for (const { source } of INTEGRATION_PAGES) {
      expect(existsSync(resolve(ROOT, 'docs', source))).toBe(true);
    }
  });
});

describe('rewriteMarkdownLinks', () => {
  const link = (href: string, source: string): string =>
    rewriteMarkdownLinks(`<a href="${href}">x</a>`, source).match(/href="([^"]*)"/)?.[1] ?? '';

  it('should send the README\'s Plotly link to the root page (#1280)', () => {
    expect(link('docs/plotly.md', 'README.md')).toBe('plotly.html');
  });

  it('should keep a link between docs pages inside docs/ (#1281)', () => {
    expect(link('TACTILE_DISPLAY.md', 'docs/CONTROLS.md')).toBe('TACTILE_DISPLAY.html');
    expect(link('./VIOLIN_PLOT_SPEC.md', 'docs/SCHEMA.md')).toBe('VIOLIN_PLOT_SPEC.html');
  });

  it('should reach docs/ from a guide built at the root', () => {
    expect(link('CONTROLS.md#label-mode', 'docs/amcharts.md')).toBe('docs/CONTROLS.html#label-mode');
  });

  it('should reach a root page from a docs page', () => {
    expect(link('plotly.md', 'docs/SCHEMA.md')).toBe('../plotly.html');
    expect(link('../README.md#controls', 'docs/CONTROLS.md')).toBe('../index.html#controls');
  });

  it('should leave absolute URLs, in-page anchors and unbuilt markdown alone', () => {
    expect(link('https://github.com/xability/maidr/blob/main/CHANGELOG.md', 'README.md'))
      .toBe('https://github.com/xability/maidr/blob/main/CHANGELOG.md');
    expect(link('#usage', 'README.md')).toBe('#usage');
    expect(link('CONTRIBUTING.md', 'README.md')).toBe('CONTRIBUTING.md');
  });

  it('should refuse a source the site does not build', () => {
    expect(() => rewriteMarkdownLinks('', 'CONTRIBUTING.md')).toThrow('not a page the site builds');
  });
});

describe('links between the built pages', () => {
  it('should be checking the pages these bugs were reported against', () => {
    // A glob that quietly stopped matching would turn every case below green.
    expect(SOURCES).toContain('README.md');
    expect(SOURCES).toContain('docs/CONTROLS.md');
    expect(SOURCES).toContain('docs/SCHEMA.md');
    expect(SOURCES).toContain('docs/TACTILE_DISPLAY.md');
    expect(SOURCES.length).toBeGreaterThanOrEqual(22);
  });

  it.each(SOURCES)('should resolve every link in %s', (source) => {
    expect(deadLinks(source)).toEqual([]);
  });
});
