import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { createHeadingSlugger, renderMarkdown, slugify } from '../../scripts/markdown';

/**
 * Tests for `scripts/markdown.js` — the heading ids every in-page link on
 * maidr.ai depends on.
 *
 * marked v15 dropped `headerIds` from core, so for as long as the site has been
 * built with it every table-of-contents link has pointed at a fragment that did
 * not exist (#913). Nothing failed: an unresolvable fragment is not an error,
 * the browser just does not move, and a screen-reader user gets no announcement
 * to say so. Fifty links across `README.md` and `docs/` were dead.
 *
 * The last `describe` is the part that stops it coming back, and it is the
 * reason this file is worth more than a slug unit test: it walks the pages the
 * build actually produces, collects every `href="#…"` in them, and asks the DOM
 * whether that id is there. It fails on a broken slug rule, on a renamed
 * heading, and on a link written against a slug GitHub would never generate —
 * three ways for this to break that a test of `slugify` alone would miss.
 *
 * It runs in the `esm` project because the module under test is ESM (the repo
 * is `"type": "module"`) and the CommonJS project cannot require it — the same
 * arrangement, and the same reasoning, as `testArgs.esm-test.ts`.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TEMPLATE = readFileSync(resolve(ROOT, 'docs/template.html'), 'utf-8');

/**
 * `docs/BRAILLE.md` carries committed merge-conflict markers (#917). One lands
 * inside a fenced code block, which flips the fence parity and swallows the
 * last ninety lines of the file — including the `## Multiline Braille Display
 * Support` heading that line 14 links to. No slug rule can fix that; the
 * heading is not a heading any more. Pinned below rather than skipped, so the
 * day #917 lands this turns red and the pin can go.
 */
const CONFLICTED_PAGE = 'docs/BRAILLE.md';

/** Every markdown source the site builds into a page, in build order. */
function markdownSources(): string[] {
  const docs = readdirSync(resolve(ROOT, 'docs'))
    .filter(file => file.endsWith('.md'))
    .sort()
    .map(file => `docs/${file}`);
  return ['README.md', ...docs];
}

/**
 * Build the page for a markdown source the way `scripts/build-site.js` does:
 * render the markdown, then drop it into the real template.
 *
 * The template matters rather than being ceremony — it carries ids of its own
 * and the skip link's `href="#main-content"`, so composing the two is what
 * checks that the skip link resolves. The build script is not called directly
 * because it writes `_site/` and shells out to `npm run build:react-example` on
 * import; this reuses the one function that decides what a heading becomes.
 */
function buildPage(source: string): Document {
  const markdown = readFileSync(resolve(ROOT, source), 'utf-8');
  // The build strips the centred logo div off the top of the README.
  const stripped = markdown.replace(/<div align="center">[\s\S]*?<\/div>\s*/, '');
  const content = `<div class="content">${renderMarkdown(stripped)}</div>`;
  return new JSDOM(TEMPLATE.replace('{{CONTENT}}', () => content)).window.document;
}

/** In-page links on a page that resolve to no element. */
function deadAnchors(source: string): string[] {
  const document = buildPage(source);
  return [...document.querySelectorAll('a[href^="#"]')]
    .map(anchor => anchor.getAttribute('href') ?? '')
    // `href="#"` is the top of the page and always resolves; the examples
    // gallery uses it for its onclick handlers.
    .filter(href => href.length > 1)
    .map(href => decodeURIComponent(href.slice(1)))
    .filter(id => document.getElementById(id) === null)
    .map(id => `#${id}`);
}

describe('the declarations beside the module', () => {
  it('should describe what the module actually returns', () => {
    // `markdown.d.ts` is hand-written and `tsc` never sees the JavaScript, so
    // nothing else catches the two disagreeing. The annotations are half the
    // check — a declared type that no longer fits stops compiling here — and
    // the assertions are the other half.
    const slug: string = slugify('Quick Start');
    const allocator: (text: string) => string = createHeadingSlugger();
    const html: string = renderMarkdown('# Quick Start\n');

    expect(typeof slug).toBe('string');
    expect(typeof allocator('Quick Start')).toBe('string');
    expect(typeof html).toBe('string');
  });
});

describe('slugify', () => {
  it('should lower-case the text and hyphenate its spaces', () => {
    expect(slugify('Quick Start')).toBe('quick-start');
  });

  it('should drop punctuation without closing the gap it leaves', () => {
    // GitHub deletes the character and hyphenates whatever spaces survive, so
    // the space that followed the comma becomes the hyphen and the one the
    // bracket never had does not appear. `docs/vegalite.md` links to both of
    // these, and they read like typos precisely because this is the rule.
    expect(slugify('bindVegaLite(view, spec, options?)')).toBe('bindvegaliteview-spec-options');
    expect(slugify('embed(target, spec, options?)')).toBe('embedtarget-spec-options');
  });

  it('should hyphenate each space rather than each run of them', () => {
    // Dropping the `&` leaves two adjacent spaces, and both become hyphens.
    // Collapsing them is the single most tempting simplification here and it
    // breaks `README.md`'s link to this very heading.
    expect(slugify('Live & Streaming Data')).toBe('live--streaming-data');
  });

  it('should drop an em dash but keep the ASCII hyphen', () => {
    // Both are `\p{Pd}`. Slugging by that category would give a single hyphen
    // and break `docs/VIOLIN_PLOT_SPEC.md`'s table of contents.
    expect(slugify('4. KDE Layer — `violin_kde`'.replace(/`/g, ''))).toBe('4-kde-layer--violin_kde');
    expect(slugify('Multi-Panel (Faceted) Charts')).toBe('multi-panel-faceted-charts');
  });

  it('should keep numbers and underscores', () => {
    expect(slugify('16. Checklist for Backend Implementation')).toBe('16-checklist-for-backend-implementation');
    expect(slugify('5. Box Layer — violin_box')).toBe('5-box-layer--violin_box');
  });

  it('should keep letters that are not ASCII', () => {
    // GitHub slugs Unicode letters rather than transliterating or dropping
    // them, so a heading in any language still gets a usable anchor.
    expect(slugify('Café Crème')).toBe('café-crème');
    expect(slugify('日本語の見出し')).toBe('日本語の見出し');
  });

  it('should drop emoji, leaving the hyphen their trailing space becomes', () => {
    // An emoji is a symbol rather than a letter, so it goes and its space
    // stays — which is why GitHub anchors for decorated headings start with a
    // hyphen. Surprising, and matching it is the whole point.
    expect(slugify('🎯 Goals')).toBe('-goals');
    expect(slugify('🎯')).toBe('');
  });
});

describe('createHeadingSlugger', () => {
  it('should number repeated headings in document order', () => {
    const slug = createHeadingSlugger();

    const slugs = ['Setup', 'Setup', 'Setup'].map(slug);

    expect(slugs).toEqual(['setup', 'setup-1', 'setup-2']);
  });

  it('should keep searching when the numbered form is itself taken', () => {
    // By the time the literal `Bar Chart 1` heading arrives, the second
    // `Bar Chart` has already been given `bar-chart-1`, so it has to settle for
    // `bar-chart-1-1`. Stopping at the first suffix instead would put two
    // elements on one id and send the link to whichever came first — and the
    // numbering carries on from where it was, so the last one is `bar-chart-3`
    // rather than `bar-chart-2`.
    const slug = createHeadingSlugger();

    const slugs = ['Bar Chart', 'Bar Chart', 'Bar Chart', 'Bar Chart 1', 'Bar Chart'].map(slug);

    expect(slugs).toEqual(['bar-chart', 'bar-chart-1', 'bar-chart-2', 'bar-chart-1-1', 'bar-chart-3']);
  });

  it('should give each document its own numbering', () => {
    const first = createHeadingSlugger();
    const second = createHeadingSlugger();

    first('Setup');

    expect(second('Setup')).toBe('setup');
  });
});

describe('renderMarkdown', () => {
  it('should give a heading the id its own table of contents links to', () => {
    // The reproduction from #913, verbatim.
    const html = renderMarkdown(
      '- [Declaring What a Chart Means](#declaring-what-a-chart-means)\n\n'
      + '## Declaring What a Chart Means\n',
    );

    expect(html).toContain('<h2 id="declaring-what-a-chart-means">');
  });

  it('should slug the text a code span renders to, not its backticks', () => {
    const html = renderMarkdown('### `MaidrLayer`\n');

    expect(html).toContain('id="maidrlayer"');
    expect(html).toContain('<code>MaidrLayer</code>');
  });

  it('should slug an ampersand rather than the entity it escapes to', () => {
    // The heading body is escaped to `&amp;`. Slugging that string instead of
    // the text would give `live-amp-streaming-data`.
    const html = renderMarkdown('## Live & Streaming Data\n');

    expect(html).toContain('<h2 id="live--streaming-data">');
    expect(html).toContain('Live &amp; Streaming Data');
  });

  it('should give every heading level an id', () => {
    const html = renderMarkdown('# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n');

    expect(html.match(/<h[1-6] id="/g)).toHaveLength(6);
  });

  it('should emit no id attribute when nothing survives the slug', () => {
    // `id=""` is not something a fragment can address, so an emoji-only
    // heading is better off without the attribute than with an empty one. The
    // second heading is here so this cannot pass by nothing having ids at all,
    // which is exactly the state the fix is against.
    const html = renderMarkdown('## 🎯\n\n## Goals\n');

    expect(html).toContain('<h2>🎯</h2>');
    expect(html).toContain('<h2 id="goals">');
    expect(html).not.toContain('id=""');
  });

  it('should restart numbering for each document it renders', () => {
    renderMarkdown('## Setup\n');
    const html = renderMarkdown('## Setup\n');

    expect(html).toContain('<h2 id="setup">');
  });
});

describe('in-page anchors in every built page', () => {
  const pages = markdownSources().filter(source => source !== CONFLICTED_PAGE);

  it('should be checking the pages this bug was reported against', () => {
    // A glob that quietly stopped matching would turn every case below green
    // while checking nothing, which is the failure mode this whole file exists
    // to close. #913 counted the links; assert the sources are still here.
    expect(pages).toContain('README.md');
    expect(pages).toContain('docs/amcharts.md');
    expect(pages).toContain('docs/VIOLIN_PLOT_SPEC.md');
    expect(pages.length).toBeGreaterThanOrEqual(18);
  });

  it.each(pages)('should resolve every in-page anchor in %s', (source) => {
    expect(deadAnchors(source)).toEqual([]);
  });

  // Pinned rather than skipped — see CONFLICTED_PAGE and #917.
  it.failing(`should resolve every in-page anchor in ${CONFLICTED_PAGE}`, () => {
    expect(deadAnchors(CONFLICTED_PAGE)).toEqual([]);
  });

  it('should point the skip link at the main landmark', () => {
    // The template's own anchor, and the one a keyboard user reaches first.
    const document = buildPage('README.md');
    const skipLink = document.querySelector('a.skip-link');

    expect(skipLink?.getAttribute('href')).toBe('#main-content');
    expect(document.getElementById('main-content')?.tagName).toBe('MAIN');
  });

  it('should put the skip link before everything else focusable', () => {
    // Offscreen-until-focused only helps if it is the first stop, and it is
    // ordinary source order that makes it one — nothing here sets tabindex.
    const document = buildPage('README.md');
    const focusable = document.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])');

    expect(focusable[0]?.className).toBe('skip-link');
  });
});
