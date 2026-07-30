/**
 * @jest-environment jsdom
 */

/**
 * Tests for src/util/katex.ts.
 *
 * KaTeX's stylesheet no longer ships inside `dist/maidr.css` — it is published
 * separately as `maidr-math.css` and linked at runtime, the first time a chat
 * response actually contains maths. Two things decide whether that works:
 *
 * - {@link containsLatex} has to agree with `remark-math` about what maths is,
 *   because the loose half of that agreement is what keeps a genuine equation
 *   from rendering unstyled.
 * - {@link resolveMathStylesheetUrl} has to find `dist` from whatever the page
 *   already loaded — a CDN script, a local one, a `file://` export, or just the
 *   `maidr.css` link — since a URL it cannot resolve means no styling at all.
 *
 * `ensureKatexStylesheet` deliberately runs at most once per page, so the tests
 * that exercise it reset the module registry and re-import rather than reaching
 * into the module to clear its flag. Everything else here is stateless and is
 * imported normally.
 */

import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { containsLatex, MATH_STYLESHEET_FILENAME, resolveMathStylesheetUrl } from '@util/katex';

/** Re-imports the module under test with its once-per-page flag cleared. */
async function freshModule(): Promise<typeof import('@util/katex')> {
  jest.resetModules();
  return import('@util/katex');
}

/** Adds a `<script src>` to the document, the way a host page loads maidr. */
function addScript(src: string): void {
  const script = document.createElement('script');
  script.src = src;
  document.head.appendChild(script);
}

/** Adds a `<link rel=stylesheet>` to the document. */
function addStylesheet(href: string): void {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/** The stylesheet links currently in the document, by resolved href. */
function linkedStylesheets(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]'),
  ).map(link => link.href);
}

// The unresolvable case warns on purpose. Silenced for the file rather than
// per test so the expected-warning cases do not print, and handed back after.
const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  document.head.innerHTML = '';
  delete window.maidrMathStylesheetUrl;
  consoleWarn.mockClear();
});

afterAll(() => {
  consoleWarn.mockRestore();
});

describe('containsLatex', () => {
  it.each([
    ['inline maths', 'The area is $\\pi r^2$ exactly.'],
    ['display maths', 'Given:\n\n$$\n\\int_0^1 x\\,dx\n$$\n'],
    ['maths spanning a line break', 'where $a\n+ b$ holds'],
    ['a bare pair of delimiters', '$$'],
  ])('should detect %s', (_name, text) => {
    expect(containsLatex(text)).toBe(true);
  });

  it.each([
    ['plain prose', 'The bar chart has 10 bars, peaking in March.'],
    ['an empty message', ''],
    ['a single stray dollar', 'It costs $5 to run.'],
    ['code with no maths', '```js\nconst total = price * 2;\n```'],
  ])('should not detect maths in %s', (_name, text) => {
    expect(containsLatex(text)).toBe(false);
  });

  it('should agree with remark-math on prose that only looks like maths', () => {
    // remark-math parses "$5 and $" as maths here, so treating this as a miss
    // would leave a real equation elsewhere in the same message unstyled. The
    // cost of matching it is one stylesheet fetch.
    expect(containsLatex('It costs $5 and $7 respectively.')).toBe(true);
  });
});

describe('the maths stylesheet filename', () => {
  it('should be the name the module matches links against', async () => {
    // The matcher is a literal rather than a pattern built from the constant:
    // escaping a filename into a regex means escaping every metacharacter, and
    // a partial escape reads as safe without being safe. That trade only holds
    // while the two agree, which is what this pins — rename the constant and
    // this fails rather than the dedup silently missing every link.
    addScript('https://cdn.jsdelivr.net/npm/maidr@3.75.0/dist/maidr.js');
    addStylesheet(`https://cdn.jsdelivr.net/npm/maidr@3.75.0/dist/${MATH_STYLESHEET_FILENAME}`);
    const { ensureKatexStylesheet } = await freshModule();

    ensureKatexStylesheet();

    expect(linkedStylesheets()).toHaveLength(1);
  });
});

describe('resolveMathStylesheetUrl', () => {
  it('should resolve against the CDN script that loaded maidr', () => {
    addScript('https://cdn.jsdelivr.net/npm/maidr@3.75.0/dist/maidr.js');

    expect(resolveMathStylesheetUrl()).toBe(
      'https://cdn.jsdelivr.net/npm/maidr@3.75.0/dist/maidr-math.css',
    );
  });

  it('should drop a cache-busting query from the script URL', () => {
    addScript('https://example.test/assets/maidr.js?v=3');

    expect(resolveMathStylesheetUrl()).toBe('https://example.test/assets/maidr-math.css');
  });

  it('should fall back to the maidr.css link when no script is attributable', () => {
    // What a host bundler leaves behind: maidr is inside the application's own
    // chunk, so no script names it, but the stylesheet is still linked.
    addScript('https://example.test/assets/app.4f2a.js');
    addStylesheet('https://example.test/vendor/maidr/dist/maidr.css');

    expect(resolveMathStylesheetUrl()).toBe(
      'https://example.test/vendor/maidr/dist/maidr-math.css',
    );
  });

  it('should prefer an explicit window.maidrMathStylesheetUrl over both', () => {
    addScript('https://cdn.jsdelivr.net/npm/maidr@3.75.0/dist/maidr.js');
    window.maidrMathStylesheetUrl = 'https://internal.test/css/katex.css';

    expect(resolveMathStylesheetUrl()).toBe('https://internal.test/css/katex.css');
  });

  it('should report nothing when neither a script nor a stylesheet names maidr', () => {
    addScript('https://example.test/assets/app.4f2a.js');
    addStylesheet('https://example.test/assets/app.4f2a.css');

    expect(resolveMathStylesheetUrl()).toBeNull();
  });
});

describe('ensureKatexStylesheet', () => {
  it('should link the stylesheet next to the maidr bundle', async () => {
    addScript('https://cdn.jsdelivr.net/npm/maidr@3.75.0/dist/maidr.js');
    const { ensureKatexStylesheet } = await freshModule();

    ensureKatexStylesheet();

    expect(linkedStylesheets()).toEqual([
      'https://cdn.jsdelivr.net/npm/maidr@3.75.0/dist/maidr-math.css',
    ]);
  });

  it('should link it once however many messages ask for it', async () => {
    addScript('https://cdn.jsdelivr.net/npm/maidr@3.75.0/dist/maidr.js');
    const { ensureKatexStylesheet } = await freshModule();

    ensureKatexStylesheet();
    ensureKatexStylesheet();
    ensureKatexStylesheet();

    expect(linkedStylesheets()).toHaveLength(1);
  });

  it('should not add a second copy when the page already links it', async () => {
    // A page can carry two copies of maidr, or an integrator may have preloaded
    // the stylesheet. Either way the rules are already there.
    addScript('https://cdn.jsdelivr.net/npm/maidr@3.75.0/dist/maidr.js');
    addStylesheet('https://cdn.jsdelivr.net/npm/maidr@3.75.0/dist/maidr-math.css');
    const { ensureKatexStylesheet } = await freshModule();

    ensureKatexStylesheet();

    expect(linkedStylesheets()).toHaveLength(1);
  });

  it('should warn once, and add nothing, when the stylesheet cannot be located', async () => {
    // Not fatal: KaTeX still emits MathML, so the equation is still read out.
    // What is lost is the visual layout, hence a warning rather than a throw.
    addScript('https://example.test/assets/app.4f2a.js');
    const { ensureKatexStylesheet } = await freshModule();

    ensureKatexStylesheet();
    ensureKatexStylesheet();

    expect(linkedStylesheets()).toHaveLength(0);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(String(consoleWarn.mock.calls[0][0])).toContain('maidrMathStylesheetUrl');
  });
});
