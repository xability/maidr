import type { Options as SanitizeSchema } from 'rehype-sanitize';

/**
 * The sanitisation allowlist for Markdown rendered in AI chat responses.
 *
 * Lives here rather than beside its one caller in `TypingEffect.tsx` because
 * that module imports `react-markdown`, which is ESM-only and cannot be loaded
 * by the Jest suite. Keeping the schema in a module with no runtime imports is
 * what lets `test/util/markdownSanitize.test.ts` check it against the MathML
 * KaTeX actually emits.
 *
 * `rehype-sanitize` *replaces* its default schema with the one it is given
 * rather than merging into it, so everything the chat is allowed to render has
 * to be named here. Two things follow from that, and both were wrong before
 * this module existed:
 *
 * 1. Allowing `math` allows the `<math>` wrapper and nothing inside it. The
 *    utility drops a disallowed element but keeps its text, so KaTeX's
 *    `<math><semantics><mrow><mfrac><mi>a</mi><mi>b</mi></mfrac></mrow>
 *    <annotation>\frac{a}{b}</annotation></semantics></math>` collapsed to
 *    `<math>ab\frac{a}{b}</math>` — the fraction gone, the raw TeX left behind,
 *    and a screen reader announcing "ab backslash frac a b". Every element in
 *    {@link MATHML_TAG_NAMES} has to be named for the equation to survive.
 * 2. Attributes are matched by **hast property name**, not HTML attribute name.
 *    `aria-hidden` never matches anything; the property is `ariaHidden`. The
 *    hyphenated spelling silently stripped `aria-hidden="true"` from KaTeX's
 *    visual layer, so screen readers read the glyph spans *as well as* the
 *    MathML. `test/util/markdownSanitize.test.ts` pins the rule.
 */

/**
 * MathML elements KaTeX emits inside `<span class="katex-mathml">`.
 *
 * Derived from KaTeX's own output rather than from the MathML specification:
 * anything KaTeX cannot produce is left out, so the allowlist stays as narrow
 * as the markup it exists to admit. The test walks a corpus through the pinned
 * KaTeX version and fails when an upgrade starts emitting something new.
 */
export const MATHML_TAG_NAMES: readonly string[] = [
  'annotation',
  'math',
  'menclose',
  'mfrac',
  'mi',
  'mn',
  'mo',
  'mover',
  'mpadded',
  'mphantom',
  'mroot',
  'mrow',
  'mspace',
  'msqrt',
  'mstyle',
  'msub',
  'msubsup',
  'msup',
  'mtable',
  'mtd',
  'mtext',
  'mtr',
  'munder',
  'munderover',
  'semantics',
];

/**
 * MathML presentation attributes allowed on {@link MATHML_TAG_NAMES}.
 *
 * Presentation only. `href` is deliberately absent — MathML carries it on any
 * element, the value reaches the page from an LLM response, and none of it is
 * needed for the accessible tree. `src` and `alt` are absent for the same
 * reason: they belong to `mglyph`, which only `\includegraphics` produces and
 * which KaTeX disables unless `trust` is set, and MAIDR renders with KaTeX's
 * untrusted defaults.
 *
 * `class` is not listed either — the shared `className` entry already covers
 * it, under the hast spelling.
 */
export const MATHML_ATTRIBUTES: readonly string[] = [
  'accent',
  'accentunder',
  'columnalign',
  'columnlines',
  'columnspacing',
  'depth',
  'display',
  'displaystyle',
  'encoding',
  'fence',
  'height',
  'largeop',
  'linebreak',
  'linethickness',
  'lspace',
  'mathbackground',
  'mathcolor',
  'mathsize',
  'mathvariant',
  'maxsize',
  'minsize',
  'notation',
  'rowlines',
  'rowspacing',
  'rspace',
  'scriptlevel',
  'separator',
  'stretchy',
  'voffset',
  'width',
  'xmlns',
];

/**
 * Attributes allowed on every element, spelled as hast property names.
 *
 * `ariaHidden` is the one that carries weight today: KaTeX marks its visual
 * layer with it so assistive technology reads the MathML instead of the glyph
 * spans beside it. The rest are allowed for markup that may carry them; no
 * plugin in the chain emits them at present, and raw HTML in a response never
 * reaches this tree because the pipeline runs without `rehype-raw`.
 */
const GLOBAL_ATTRIBUTES: readonly string[] = [
  'className',
  'ariaLabel',
  'ariaHidden',
  'role',
  'ariaBusy',
  'ariaLive',
  'ariaAtomic',
];

/** Every MathML element, mapped to the presentation attributes it may keep. */
function mathmlAttributes(): Record<string, string[]> {
  return Object.fromEntries(
    MATHML_TAG_NAMES.map(tagName => [tagName, [...MATHML_ATTRIBUTES]]),
  );
}

/**
 * The schema `TypingEffect` hands to `rehype-sanitize`.
 *
 * Built fresh on each call so a caller cannot mutate the shared allowlists.
 * @returns The allowlist of tags and attributes an AI chat response may render.
 */
export function createChatSanitizeSchema(): SanitizeSchema {
  return {
    attributes: {
      '*': [...GLOBAL_ATTRIBUTES],
      'a': ['href', 'target'],
      'img': ['src', 'alt'],
      'span': ['style'],
      'svg': ['ariaHidden', 'role', 'xmlns', 'width', 'height', 'viewBox'],
      'path': ['d'],
      ...mathmlAttributes(),
    },
    tagNames: [
      'p',
      'br',
      'b',
      'i',
      'em',
      'strong',
      'a',
      'pre',
      'code',
      'ul',
      'ol',
      'li',
      'blockquote',
      'img',
      'span',
      'svg',
      'path',
      ...MATHML_TAG_NAMES,
    ],
  };
}
