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
 * These tests cover the schema's *contents*, not `rehype-sanitize` running on
 * it: the package is ESM-only and this suite is CommonJS, so it cannot be
 * imported here. That is a property of the current Jest configuration rather
 * than a hard limit — a second Jest project with `extensionsToTreatAsEsm` and
 * `--experimental-vm-modules` loads it fine — but wiring one up is test
 * infrastructure, not part of this fix.
 *
 * So two of the utility's rules are relied on rather than re-verified here:
 *
 * - a disallowed element is dropped but its text is kept, so a missing MathML
 *   element leaves the leaf characters behind as prose;
 * - attributes match on hast property names (`ariaHidden`), not HTML attribute
 *   names (`aria-hidden`), and an entry under `'*'` is additive to the
 *   element's own list rather than replaced by it.
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
 * Anything in KaTeX's MathML branch.
 *
 * `m[a-z-]+` covers `math` and every `m*` element; `semantics` and
 * `annotation` are the two that do not start with `m`. The hyphens are what
 * make `annotation-xml` match: KaTeX does not emit it under the untrusted
 * defaults MAIDR renders with, but a pattern that could not match it would
 * quietly drop the element from the survey instead of failing, and a survey
 * that cannot see an element cannot report it as unnamed.
 */
const MATHML_ELEMENT = /^(?:semantics|annotation[a-z-]*|m[a-z-]+)$/;

/** One attribute, and the element KaTeX put it on. */
interface AttributeUsage {
  readonly tagName: string;
  readonly attribute: string;
}

/** What a corpus render produced, kept separate so bare elements still count. */
interface Usage {
  /** Every element name seen, including the many that carry no attributes. */
  readonly tagNames: Set<string>;
  /** Every element/attribute pair seen. */
  readonly attributes: AttributeUsage[];
}

/**
 * The hast property name for an HTML or MathML attribute.
 *
 * Only the two rules that apply to KaTeX's output, written out rather than
 * pulled from `property-information` — that package is ESM-only, and the point
 * of the assertion is to state the rule the schema has to follow rather than to
 * agree with another implementation of it.
 * @param attribute - The attribute name as it appears in the markup.
 * @returns The name `rehype-sanitize` matches the attribute under.
 */
function hastPropertyName(attribute: string): string {
  if (attribute === 'class') {
    return 'className';
  }
  return attribute.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Renders the corpus and collects everything KaTeX puts in the tree.
 *
 * Covers both of KaTeX's layers, not just the MathML: the visual layer carries
 * the `aria-hidden` that keeps it from being announced twice, and the SVG that
 * draws stretchy delimiters. An allowlist checked against one layer alone lets
 * the other rot.
 *
 * Both display modes are rendered because they take different paths — a sum's
 * limits become `msubsup` inline and `munderover` in display mode, so covering
 * one alone would leave half the allowlist unchecked. Options are left at their
 * defaults to match how `rehype-katex` is configured in `TypingEffect`; that is
 * what keeps `\href` and `\includegraphics` (and so `href`, `src` and `mglyph`)
 * out of the output.
 * @returns The elements seen, and the element/attribute pairs seen.
 */
function collectUsage(): Usage {
  const tagNames = new Set<string>();
  // Keyed so a pair seen in fifty renders is reported once.
  const attributes = new Map<string, AttributeUsage>();

  for (const displayMode of [false, true]) {
    for (const tex of CORPUS) {
      const html = katex.renderToString(tex, { throwOnError: false, displayMode });
      const { document } = new JSDOM(`<div>${html}</div>`).window;
      const root = document.querySelector('.katex');
      if (root === null) {
        // `\begin{align}` is display-only in LaTeX too, so KaTeX renders the
        // inline pass as an error span. Every other combination has to render,
        // or the corpus is checking nothing.
        expect(document.querySelector('.katex-error')).not.toBeNull();
        continue;
      }

      for (const element of root.querySelectorAll('*')) {
        const tagName = element.tagName.toLowerCase();
        // Recorded before the attributes, because most of the elements that
        // carry an equation's structure — `mrow`, `msqrt`, `msub` — have none.
        tagNames.add(tagName);
        for (const attribute of element.getAttributeNames()) {
          attributes.set(`${tagName}\0${attribute}`, { tagName, attribute });
        }
      }
    }
  }

  return { tagNames, attributes: [...attributes.values()] };
}

/** The MathML subset of {@link collectUsage}. */
function collectMathmlUsage(): { tagNames: Set<string>; attributes: Set<string> } {
  const usage = collectUsage();
  const tagNames = new Set([...usage.tagNames].filter(tag => MATHML_ELEMENT.test(tag)));
  const attributes = new Set(
    usage.attributes
      .filter(({ tagName }) => MATHML_ELEMENT.test(tagName))
      .map(({ attribute }) => attribute),
  );

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

/**
 * Every element the GFM and CommonMark side of the pipeline produces.
 *
 * Collected by running a markdown corpus through `remark-parse` →
 * `remark-gfm` → `remark-rehype` and walking the resulting hast tree. That run
 * cannot happen here — the whole chain is ESM and this suite is CommonJS — so
 * unlike {@link MATHML_TAG_NAMES}, which the KaTeX cases above check against
 * KaTeX itself, this list is a transcript rather than a live survey. It will
 * not notice a plugin upgrade that starts emitting something new.
 *
 * #678 wires up the ESM Jest project that closes that gap; this list is what
 * the survey should reproduce when it does.
 *
 * A transcript is also only as good as the corpus behind it. `ol[start]`,
 * `a[title]` and `img[title]` are absent from a corpus whose lists all begin
 * at 1 and whose links carry no title, and were missed on the first pass for
 * exactly that reason.
 */
const GFM_ELEMENTS: readonly string[] = [
  'a',
  'blockquote',
  // From a hard line break — two trailing spaces, or a trailing backslash.
  // Already allowed before this change, so its absence here cost nothing at
  // the time; a transcript with a hole in it is what costs something later.
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'input',
  'li',
  'ol',
  'p',
  'pre',
  'section',
  'strong',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
];

/** Element/property pairs from the same run, minus the ones `'*'` covers. */
const GFM_PROPERTIES: readonly (readonly [string, string])[] = [
  ['a', 'ariaDescribedBy'],
  ['a', 'ariaLabel'],
  ['a', 'dataFootnoteBackref'],
  ['a', 'dataFootnoteRef'],
  ['a', 'href'],
  ['a', 'id'],
  ['a', 'title'],
  ['h2', 'id'],
  ['img', 'alt'],
  ['img', 'src'],
  ['img', 'title'],
  ['input', 'checked'],
  ['input', 'disabled'],
  ['input', 'type'],
  ['li', 'id'],
  // Emitted only when a numbered list does not begin at 1.
  ['ol', 'start'],
  ['section', 'dataFootnotes'],
  ['td', 'align'],
  ['th', 'align'],
];

describe('GFM allowlist', () => {
  it('should name every element the markdown pipeline emits', () => {
    const schema = createChatSanitizeSchema();

    const stripped = GFM_ELEMENTS.filter(tag => !schema.tagNames?.includes(tag)).sort();

    // Dropping an element keeps its text, so the failure is silent: a table
    // becomes "BarValueJan45.2", a heading becomes a sentence, and `~~gone~~`
    // reads as an assertion rather than a retraction.
    expect(stripped).toEqual([]);
  });

  it('should allow every attribute the markdown pipeline emits', () => {
    const schema = createChatSanitizeSchema();
    const shared = schema.attributes?.['*'] ?? [];

    const stripped = GFM_PROPERTIES.filter(([tagName, property]) => {
      const allowed = [...shared, ...(schema.attributes?.[tagName] ?? [])];
      return !allowed.some(entry => (typeof entry === 'string' ? entry : entry[0]) === property);
    }).map(([tagName, property]) => `${tagName}[${property}]`).sort();

    expect(stripped).toEqual([]);
  });

  it('should give a table its structure and its column alignment', () => {
    const schema = createChatSanitizeSchema();

    // Named separately from the survey because this is the case the issue was
    // filed for: a table of chart values is the most likely thing an LLM emits
    // when describing a plot, and losing it leaves a screen reader user with a
    // run of digits and nothing binding them to a label.
    expect(schema.tagNames).toEqual(
      expect.arrayContaining(['table', 'thead', 'tbody', 'tr', 'th', 'td']),
    );
    expect(schema.attributes?.th).toContain('align');
    expect(schema.attributes?.td).toContain('align');
  });

  it('should keep a numbered list starting anywhere but 1', () => {
    const schema = createChatSanitizeSchema();

    // `start` is emitted only for a list that does not begin at 1, so losing
    // it renumbers the list from 1 without dropping anything visible — the
    // reader is given different numbers from the ones that were written.
    expect(schema.attributes?.ol).toContain('start');
  });

  it('should admit a task-list checkbox only as a disabled checkbox', () => {
    const schema = createChatSanitizeSchema();

    // `checked` is the whole point — without it a done task and an outstanding
    // one are indistinguishable — and `disabled` is what keeps it inert.
    // `type` is pinned to the value, not just the name.
    expect(schema.attributes?.input).toEqual([['type', 'checkbox'], 'checked', 'disabled']);
  });

  it('should pin the checkbox type rather than trusting the pipeline', () => {
    const schema = createChatSanitizeSchema();

    // The tuple form replaces a disallowed value rather than dropping it,
    // which is what makes this worth pinning: a dropped `type` leaves an
    // `input` that renders as a text box, so allowing the bare name would
    // fail open on any value that ever reached it.
    const type = schema.attributes?.input?.find(
      entry => typeof entry !== 'string' && entry[0] === 'type',
    );

    expect(type).toEqual(['type', 'checkbox']);
  });

  it('should never let a rendered response become a submittable control', () => {
    const schema = createChatSanitizeSchema();

    // The attributes that would turn `input` from a rendering of markdown into
    // a form. None is emitted by the pipeline, so allowing any of them could
    // only ever admit something a response invented.
    for (const attribute of ['form', 'name', 'value', 'formAction', 'onClick']) {
      expect(schema.attributes?.input).not.toContain(attribute);
    }
  });

  it('should name the footnote data attributes rather than a data wildcard', () => {
    const schema = createChatSanitizeSchema();

    expect(schema.attributes?.a).toContain('dataFootnoteRef');
    expect(schema.attributes?.a).toContain('dataFootnoteBackref');
    // A `data*` wildcard would admit every dataset key any future plugin
    // invents, which is a wider grant than footnotes need.
    const wildcards = Object.values(schema.attributes ?? {})
      .flat()
      .map(entry => (typeof entry === 'string' ? entry : entry[0]))
      .filter(name => name.includes('*'));
    expect(wildcards).toEqual([]);
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

  it('should name every element KaTeX emits, in both of its layers', () => {
    const schema = createChatSanitizeSchema();

    const stripped = [...collectUsage().tagNames]
      .filter(tagName => !schema.tagNames?.includes(tagName))
      .sort();

    // `line` — which `\cancel` and `\not` draw their strike with — was missing
    // until this case existed, and an unnamed element is removed outright.
    expect(stripped).toEqual([]);
  });

  it('should allow every attribute KaTeX puts on any element, under its hast name', () => {
    const schema = createChatSanitizeSchema();
    const shared = schema.attributes?.['*'] ?? [];

    const stripped = collectUsage().attributes.filter(({ tagName, attribute }) => {
      const property = hastPropertyName(attribute);
      const allowed = [...shared, ...(schema.attributes?.[tagName] ?? [])];
      return !allowed.some(entry => (typeof entry === 'string' ? entry : entry[0]) === property);
    }).map(({ tagName, attribute }) => `${tagName}[${attribute}]`).sort();

    // Covers both layers. `span[aria-hidden]` is the one that broke the
    // accessible tree; `svg[preserveAspectRatio]` is the one that broke the
    // rendering of stretchy delimiters, and went unnoticed because the first
    // version of this suite only surveyed the MathML.
    expect(stripped).toEqual([]);
  });

  it('should allow a link only what the pipeline puts on one', () => {
    const schema = createChatSanitizeSchema();

    // Was `['href']` until footnotes were admitted; the rest is the wiring
    // remark-gfm emits on a reference and its backref. `href` keeps the
    // default `protocols` filtering; see the test below.
    expect(schema.attributes?.a).toEqual([
      'href',
      'title',
      'id',
      'ariaLabel',
      'ariaDescribedBy',
      'dataFootnoteRef',
      'dataFootnoteBackref',
    ]);
  });

  it('should never allow target on a link', () => {
    const schema = createChatSanitizeSchema();

    // Markdown has no syntax for it and raw HTML is escaped to text, so it
    // could only ever admit a `target="_blank"` with no `rel="noopener"` the
    // day something could set one. Stated on its own rather than implied by
    // the exact list above, which now grows whenever the pipeline does.
    expect(schema.attributes?.a).not.toContain('target');
    expect(schema.attributes?.['*']).not.toContain('target');
  });

  it('should override no schema key other than tagNames and attributes', () => {
    const schema = createChatSanitizeSchema();

    // `hast-util-sanitize` resolves its config as `{...defaultSchema,
    // ...options}` — one level deep. Every key absent here keeps its default,
    // which is what still strips `javascript:` from a link without `protocols`
    // being named. Declaring a partial `protocols` would replace that map
    // rather than extend it, and drop the protocol filtering the default
    // provides for the keys it left out.
    expect(Object.keys(schema).sort()).toEqual(['attributes', 'tagNames']);
  });

  it('should return a fresh schema each call, nested arrays included', () => {
    const first = createChatSanitizeSchema();
    const second = createChatSanitizeSchema();

    expect(first).not.toBe(second);
    expect(first.tagNames).not.toBe(second.tagNames);
    expect(first.attributes).not.toBe(second.attributes);
    // The per-element lists too — a shared array one level down would leave the
    // allowlists just as mutable, while the two assertions above still passed.
    expect(first.attributes?.['*']).not.toBe(second.attributes?.['*']);
    expect(first.attributes?.math).not.toBe(second.attributes?.math);
  });

  it('should not let a mutated schema reach the next caller', () => {
    const first = createChatSanitizeSchema();

    first.tagNames?.push('script');
    first.attributes?.['*']?.push('onclick');
    first.attributes?.math?.push('href');

    // The property the doc comment actually promises, stated as the failure it
    // exists to prevent: one caller widening its own copy must not widen
    // anyone else's, nor the module's exported lists.
    const second = createChatSanitizeSchema();
    expect(second.tagNames).not.toContain('script');
    expect(second.attributes?.['*']).not.toContain('onclick');
    expect(second.attributes?.math).not.toContain('href');
    expect(MATHML_TAG_NAMES).not.toContain('script');
    expect(MATHML_ATTRIBUTES).not.toContain('href');
  });
});
