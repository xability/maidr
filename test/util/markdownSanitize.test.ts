/**
 * Tests for src/util/markdownSanitize.ts.
 *
 * The allowlist is checked against KaTeX itself rather than against a fixed
 * string of expected markup. KaTeX is the only thing that decides which MathML
 * a response can contain, so rendering a corpus through the pinned version and
 * comparing what comes out to what the schema admits is the assertion that
 * keeps meaning something after an upgrade: a KaTeX release that starts
 * emitting `<mmultiscripts>` fails here instead of silently losing the markup
 * at runtime.
 *
 * `rehype-sanitize` cannot be exercised directly — it is ESM-only and the Jest
 * suite is CommonJS — so these tests cover the schema's *contents*. Its two
 * matching rules are relied on rather than re-verified:
 *
 * - a disallowed element is dropped but its text is kept, so a missing MathML
 *   element leaves the leaf characters behind as prose;
 * - attributes match on hast property names (`ariaHidden`), not HTML attribute
 *   names (`aria-hidden`).
 */

import { describe, expect, it } from '@jest/globals';
import {
  createChatSanitizeSchema,
  MATHML_ATTRIBUTES,
  MATHML_TAG_NAMES,
} from '@util/markdownSanitize';
import { JSDOM } from 'jsdom';
import katex from 'katex';

/**
 * TeX exercising the output paths KaTeX has: fractions, radicals, scripts,
 * over/under-braces, tables, spacing, phantoms, enclosures and text runs.
 */
const CORPUS: readonly string[] = [
  '\\frac{a}{b}',
  '\\sum_{i=1}^{n} x_i',
  '\\prod_k k',
  '\\sqrt{x}',
  '\\sqrt[3]{x}',
  'x^2_j',
  '\\int_0^\\infty e^{-x}dx',
  '\\lim_{x\\to0}\\frac{\\sin x}{x}',
  '\\begin{matrix}a&b\\\\c&d\\end{matrix}',
  '\\begin{cases}1&x>0\\\\0&x\\le0\\end{cases}',
  '\\begin{align}a&=b\\\\c&=d\\end{align}',
  '\\begin{array}{c|c}a&b\\\\\\hline c&d\\end{array}',
  '\\overline{AB}',
  '\\underline{x}',
  '\\underbrace{x+y}_{z}',
  '\\overbrace{x}^{y}',
  '\\overset{a}{b}',
  '\\underset{a}{b}',
  '\\text{hello world}',
  '\\mathbb{R}\\mathcal{L}\\mathfrak{g}',
  '\\mathrm{d}x',
  '\\vec{v}\\hat{n}\\dot{x}',
  '\\left(\\frac12\\right)',
  '\\binom{n}{k}',
  '\\boxed{x=1}',
  '\\cancel{x}',
  'a\\ne b\\le c\\ge d',
  '\\phantom{xy}',
  '\\smash{x}',
  '\\color{red}{x}',
  '\\textcolor{blue}{z}',
  '\\hspace{1em}',
  '\\rule{1em}{1em}',
  '\\raisebox{1em}{x}',
  '\\substack{a\\\\b}',
  '\\operatorname{foo}',
  '\\xrightarrow{f}',
  '\\bmod 5',
  '\\not=',
];

/**
 * Anything in KaTeX's MathML branch. `m[a-z]+` covers `math` and every `m*`
 * element; `semantics` and `annotation` are the two that do not start with `m`.
 */
const MATHML_ELEMENT = /^(?:semantics|annotation|m[a-z]+)$/;

interface MathmlUsage {
  readonly tagNames: Set<string>;
  readonly attributes: Set<string>;
}

/**
 * Renders the corpus and collects the MathML KaTeX puts in the accessible tree.
 *
 * Both display modes are rendered because they take different paths — a sum's
 * limits become `msubsup` inline and `munderover` in display mode, so covering
 * one alone would leave half the allowlist unchecked. Options are left at their
 * defaults to match how `rehype-katex` is configured in `TypingEffect`; that is
 * what keeps `\href` and `\includegraphics` (and so `href`, `src` and `mglyph`)
 * out of the output.
 * @returns The element and attribute names found under `.katex-mathml`.
 */
function collectMathmlUsage(): MathmlUsage {
  const tagNames = new Set<string>();
  const attributes = new Set<string>();

  for (const displayMode of [false, true]) {
    for (const tex of CORPUS) {
      const html = katex.renderToString(tex, { throwOnError: false, displayMode });
      const { document } = new JSDOM(`<div>${html}</div>`).window;
      const mathml = document.querySelector('.katex-mathml');
      if (mathml === null) {
        // `\begin{align}` is display-only in LaTeX too, so KaTeX renders the
        // inline pass as an error span with no MathML. Every other combination
        // has to produce some, or the corpus is checking nothing.
        expect(document.querySelector('.katex-error')).not.toBeNull();
        continue;
      }

      for (const element of mathml.querySelectorAll('*')) {
        const tagName = element.tagName.toLowerCase();
        if (!MATHML_ELEMENT.test(tagName)) {
          continue;
        }
        tagNames.add(tagName);
        for (const attribute of element.getAttributeNames()) {
          attributes.add(attribute);
        }
      }
    }
  }

  return { tagNames, attributes };
}

describe('mathML allowlist', () => {
  it('should name every MathML element KaTeX emits', () => {
    const { tagNames } = collectMathmlUsage();

    const missing = [...tagNames].filter(tag => !MATHML_TAG_NAMES.includes(tag)).sort();

    // A missing element is not a rendering nicety: rehype-sanitize keeps the
    // text of an element it drops, so the equation degrades into its own leaf
    // characters run together — "ab" for a fraction — rather than disappearing.
    expect(missing).toEqual([]);
  });

  it('should name every MathML attribute KaTeX emits', () => {
    const { attributes } = collectMathmlUsage();

    const missing = [...attributes]
      // `class` is covered by the shared `className` entry, under the hast
      // spelling that entry has to use.
      .filter(attribute => attribute !== 'class')
      .filter(attribute => !MATHML_ATTRIBUTES.includes(attribute))
      .sort();

    expect(missing).toEqual([]);
  });

  it('should cover the elements that carry the structure of an equation', () => {
    // Belt and braces for the corpus: were it ever trimmed to the point of
    // exercising no fractions or scripts, the two tests above would still pass
    // while allowing the allowlist to lose them.
    expect(MATHML_TAG_NAMES).toEqual(
      expect.arrayContaining(['math', 'semantics', 'mrow', 'mfrac', 'msqrt', 'msub', 'msup', 'mi', 'mo', 'mn']),
    );
  });

  it('should not allow href or src on MathML elements', () => {
    // MathML accepts `href` on any element and the value arrives from an LLM
    // response. Nothing in the accessible tree needs either one.
    expect(MATHML_ATTRIBUTES).not.toContain('href');
    expect(MATHML_ATTRIBUTES).not.toContain('src');
  });
});

describe('createChatSanitizeSchema', () => {
  it('should allow every MathML element as a tag name', () => {
    const schema = createChatSanitizeSchema();

    expect(schema.tagNames).toEqual(expect.arrayContaining([...MATHML_TAG_NAMES]));
  });

  it('should give each MathML element its presentation attributes', () => {
    const schema = createChatSanitizeSchema();

    for (const tagName of MATHML_TAG_NAMES) {
      expect(schema.attributes?.[tagName]).toEqual([...MATHML_ATTRIBUTES]);
    }
  });

  it('should spell attributes as hast property names, never as HTML attribute names', () => {
    const schema = createChatSanitizeSchema();

    const hyphenated = Object.values(schema.attributes ?? {})
      .flat()
      .map(entry => (typeof entry === 'string' ? entry : entry[0]))
      .filter(name => name.includes('-'))
      .sort();

    // `aria-hidden` matches no property and so stripped KaTeX's own
    // `aria-hidden="true"`, leaving the visual glyph spans exposed to a screen
    // reader alongside the MathML. The property is `ariaHidden`. No attribute
    // this schema needs is spelled with a hyphen.
    expect(hyphenated).toEqual([]);
  });

  it('should keep aria-hidden available so KaTeX can hide its visual layer', () => {
    const schema = createChatSanitizeSchema();

    expect(schema.attributes?.['*']).toContain('ariaHidden');
  });

  it('should return a fresh schema each call', () => {
    const first = createChatSanitizeSchema();
    const second = createChatSanitizeSchema();

    expect(first).not.toBe(second);
    expect(first.tagNames).not.toBe(second.tagNames);
  });
});
