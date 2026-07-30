import type { Options as SanitizeSchema } from 'rehype-sanitize';

/**
 * The sanitisation allowlist for Markdown rendered in AI chat responses.
 *
 * Lives here rather than beside its one caller in `TypingEffect.tsx` because
 * that module imports `react-markdown`, which is ESM-only and so is not
 * loadable by the Jest suite as it is configured — CommonJS, with `allowJs`
 * off, so nothing under `node_modules` is transformed. Keeping the schema in a
 * module with no runtime imports is what lets
 * `test/util/markdownSanitize.test.ts` check it against the MathML KaTeX
 * actually emits.
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
 * Both entries are load-bearing. KaTeX puts `class` on every span it builds,
 * and marks its visual layer `aria-hidden` so assistive technology reads the
 * MathML instead of the glyph spans beside it.
 *
 * The list used to also carry `role`, `ariaLabel`, `ariaBusy`, `ariaLive` and
 * `ariaAtomic`. Nothing in the pipeline emits any of them — the `role` and
 * `aria-label` that `TypingEffect` puts on `<pre>` and `<a>` are React props,
 * applied to the tree after it has been sanitised — and while they were
 * misspelled they were inert. Correcting the spelling would have made them
 * live for the first time, so they are dropped instead: a response body cannot
 * reach an attribute today (the pipeline runs without `rehype-raw`, so raw HTML
 * is escaped to text), and this way it still could not were that to change.
 */
const GLOBAL_ATTRIBUTES: readonly string[] = [
  'className',
  'ariaHidden',
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
 * `TypingEffect` calls it once and hoists the result to module scope — the
 * chat animation re-renders every 10 ms, and the allowlist is the same for
 * every message — so the freshness matters to this function's own contract
 * rather than to anything visible at that call site.
 *
 * Deliberately declares only `tagNames` and `attributes`. `hast-util-sanitize`
 * resolves its configuration as `{...defaultSchema, ...options}` — a shallow
 * merge, one level deep — so every key left out here keeps its default. That is
 * what still strips `javascript:` from a link or an image without `protocols`
 * appearing anywhere below: the default map covers `href`, `src`, `cite` and
 * `longDesc`. Adding a partial `protocols` key would replace that map outright
 * rather than extend it, which is why the test asserts this schema declares no
 * key beyond the two it means to override.
 * @returns The allowlist of tags and attributes an AI chat response may render.
 */
export function createChatSanitizeSchema(): SanitizeSchema {
  return {
    attributes: {
      '*': [...GLOBAL_ATTRIBUTES],
      // No `target`. Markdown has no syntax for it, raw HTML is escaped to
      // text, and nothing in the plugin chain adds one, so it was allowing an
      // attribute that could not arrive — and a `target="_blank"` without
      // `rel="noopener"` is reverse tabnabbing waiting for the day one could.
      // Same reasoning as the ARIA entries dropped from GLOBAL_ATTRIBUTES.
      'a': ['href'],
      'img': ['src', 'alt'],
      // `style` here and on `svg` below carries KaTeX's computed layout —
      // `height:1em;vertical-align:-0.25em`, `top:-4em`, `width:0.471em`. The
      // values are generated, never passed through: `\htmlStyle` and
      // `\htmlClass` are disabled by the untrusted defaults KaTeX renders with,
      // and a raw `<span style>` in a response is escaped to text. So a
      // response cannot reach a `url()` and turn a rendered equation into a
      // tracking beacon.
      'span': ['style'],
      // KaTeX's visual layer. It sits inside an `aria-hidden` wrapper, so what
      // is lost here is rendering rather than announcement — but it is lost the
      // same way the MathML was, by not being named. `style` is what `\vec`,
      // `\hat` and `\dot` size their accent with. `preserveAspectRatio` is
      // load-bearing for stretchy delimiters and arrows, which KaTeX draws at
      // `width="400em"` over a `viewBox` 400000 units wide and expects
      // `xMaxYMin slice` to crop rather than scale.
      'svg': ['xmlns', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'style'],
      'path': ['d'],
      // `\cancel` and `\not` draw their strike as an SVG line.
      'line': ['x1', 'x2', 'y1', 'y2', 'strokeWidth'],
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
      'line',
      ...MATHML_TAG_NAMES,
    ],
  };
}
