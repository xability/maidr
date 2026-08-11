/**
 * Vite plugin: publish KaTeX's stylesheet as a separate, on-demand asset.
 *
 * `src/ui/components/TypingEffect.tsx` renders LaTeX in AI chat responses with
 * KaTeX. KaTeX's stylesheet used to be imported statically, which put it — and
 * the 20 font faces it inlines as base64 — into `dist/maidr.css`, so every page
 * that loaded MAIDR paid ~360 kB for markup it would almost never render.
 *
 * The import is gone. Instead this plugin reads `katex/dist/katex.min.css`
 * straight out of `node_modules`, inlines its fonts itself, and emits the
 * result as `dist/maidr-math.css`. `src/util/katex.ts` adds a `<link>` to it at
 * runtime, the first time a chat response actually contains maths.
 *
 * Two things are load-bearing about how it is emitted:
 *
 * - **The fonts stay `data:` URIs.** Sandboxed embedding contexts routinely
 *   allow a CDN for `style-src` but not for `font-src` — the claude.ai artifact
 *   sandbox is one concrete example — so the stylesheet has to be fetchable on
 *   its own while carrying its fonts with it. Splitting the file is safe;
 *   switching to external `.woff2` files is not.
 * - **`maidr.css` keeps being emitted.** With KaTeX gone, MAIDR has no static
 *   CSS left at all (the UI is styled at runtime by emotion), so Vite would
 *   emit no stylesheet and the file would vanish from the published package.
 *   Every integration links it by name — py-maidr and r-maidr copy it out of
 *   `dist` by filename — so a placeholder is emitted in its place.
 *
 * Registered for every bundle, next to {@link woff2OnlyFonts}. The content is
 * read from `node_modules` rather than derived from the module graph, so every
 * bundle emits byte-identical files and the parallel build in
 * `scripts/build.js` merges them without a collision.
 */

import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { stripNonWoff2FontSources } from './vite-plugin-woff2-only.js';

/** Name of the on-demand maths stylesheet in `dist`. */
export const MATH_STYLESHEET_FILENAME = 'maidr-math.css';

/** Name of the stylesheet every integration already links. */
export const CORE_STYLESHEET_FILENAME = 'maidr.css';

/**
 * What `dist/maidr.css` contains once KaTeX has moved out of it.
 *
 * Emitted only when the bundle produced no stylesheet of its own, so the day
 * MAIDR gains real static CSS this placeholder gets out of the way instead of
 * overwriting it. Written with a `/*!` bang comment so a minifier in the chain
 * would keep the explanation rather than shipping a zero-byte file.
 */
export const CORE_STYLESHEET_PLACEHOLDER = `/*!
 * maidr.css — intentionally almost empty.
 *
 * MAIDR styles its interface at runtime, so there is no static CSS to ship.
 * This file is still published so that existing
 * <link rel="stylesheet" href=".../maidr.css"> tags keep resolving.
 *
 * LaTeX in AI chat responses is styled by maidr-math.css, which maidr.js
 * fetches from this same directory the first time a response contains maths.
 */
`;

/**
 * Matches a `url(...)` value, capturing everything between the parentheses.
 *
 * Deliberately does no unquoting or trimming of its own — a pattern that tried
 * to would have `\s*` and the target class competing for the same characters,
 * which is polynomial backtracking on a crafted input. {@link parseUrlTarget}
 * does that part in plain code instead, in linear time.
 */
const URL_RE = /url\(([^)]*)\)/g;

/** MIME types for the font formats a stylesheet can reference. */
const FONT_MIME_TYPES = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.svg': 'image/svg+xml',
};

/**
 * Reduce the raw text inside `url(...)` to the target it names.
 *
 * @param {string} raw the captured text, whitespace and quotes included
 * @returns {string} the target, unquoted and trimmed
 */
function parseUrlTarget(raw) {
  const trimmed = raw.trim();
  const quote = trimmed[0];
  const quoted = (quote === '"' || quote === '\'')
    && trimmed.length >= 2
    && trimmed.endsWith(quote);
  return quoted ? trimmed.slice(1, -1) : trimmed;
}

/**
 * Reports whether a `url(...)` target has to be inlined to survive the move.
 *
 * Anything already self-contained (`data:`) or absolute (`http:`, `//host/…`,
 * `/path`) resolves the same from wherever the stylesheet is served, so it is
 * left alone. A relative path would not: it resolves against the stylesheet's
 * own location, and this stylesheet is emitted into `dist`, nowhere near the
 * `node_modules` directory it was read from.
 *
 * @param {string} target the raw `url(...)` value
 * @returns {boolean} true when the target is relative to the stylesheet
 */
function isRelativeUrl(target) {
  return target !== ''
    && !/^[a-z][\w+.-]*:/i.test(target)
    && !target.startsWith('//')
    && !target.startsWith('/')
    && !target.startsWith('#');
}

/**
 * Rewrite every relative `url(...)` in `css` as a base64 `data:` URI.
 *
 * @param {string} css the stylesheet to rewrite
 * @param {(specifier: string) => Uint8Array | null} readFont resolves a
 * stylesheet-relative path to its bytes, or null when there is no such file
 * @returns {{ css: string, inlined: number }} the rewritten stylesheet and how
 * many URLs it absorbed
 * @throws {Error} if a referenced file cannot be read, or carries an extension
 * with no known MIME type — either would leave a URL that resolves nowhere once
 * the stylesheet is served from `dist`, and a silently broken font is worse
 * than a failed build.
 */
export function inlineFontUrls(css, readFont) {
  let inlined = 0;

  const out = css.replace(URL_RE, (match, raw) => {
    const target = parseUrlTarget(raw);
    if (!isRelativeUrl(target)) {
      return match;
    }

    // Strip a query or fragment before touching the filesystem: `.eot` sources
    // conventionally carry `?#iefix`, and cache busters are common elsewhere.
    const specifier = target.split(/[?#]/)[0];
    const mime = FONT_MIME_TYPES[path.extname(specifier).toLowerCase()];
    if (!mime) {
      throw new Error(
        `cannot inline "${target}": no known MIME type for its extension. `
        + 'Add one to FONT_MIME_TYPES if this format is meant to ship.',
      );
    }

    const bytes = readFont(specifier);
    if (!bytes) {
      throw new Error(`cannot inline "${target}": no such file next to the stylesheet.`);
    }

    inlined++;
    return `url(data:${mime};base64,${Buffer.from(bytes).toString('base64')})`;
  });

  return { css: out, inlined };
}

/**
 * Turn a stylesheet into the self-contained form that ships in `dist`: woff2
 * sources only, every one of them inlined.
 *
 * Order matters. Trimming first means the woff and truetype alternatives are
 * gone before anything is read off disk, so the build neither reads nor base64s
 * ~950 kB of font data it would immediately discard.
 *
 * @param {string} css the stylesheet to prepare
 * @param {(specifier: string) => Uint8Array | null} readFont resolves a
 * stylesheet-relative path to its bytes
 * @returns {{ css: string, inlined: number, rewritten: number, skipped: number }}
 * the prepared stylesheet, how many URLs were inlined, and the `@font-face`
 * counts from the trim step
 */
export function buildMathStylesheet(css, readFont) {
  const { css: trimmed, rewritten, skipped } = stripNonWoff2FontSources(css);
  const { css: out, inlined } = inlineFontUrls(trimmed, readFont);
  return { css: out, inlined, rewritten, skipped };
}

/**
 * Read KaTeX's stylesheet from `node_modules` and prepare it for `dist`.
 *
 * Resolved through `require.resolve` rather than a hard-coded path so it keeps
 * working under pnpm, yarn's linker, and a hoisted install alike.
 *
 * @returns {{ css: string, inlined: number, rewritten: number, skipped: number }}
 * the stylesheet ready to emit, with the counts from each step
 */
export function readMathStylesheet() {
  const require = createRequire(import.meta.url);
  const stylesheetPath = require.resolve('katex/dist/katex.min.css');
  const stylesheetDir = path.dirname(stylesheetPath);

  return buildMathStylesheet(
    fs.readFileSync(stylesheetPath, 'utf8'),
    (specifier) => {
      const fontPath = path.resolve(stylesheetDir, specifier);
      // Refuse to read outside the package the stylesheet came from. KaTeX's
      // own `url()` values never do, but the check keeps a future dependency
      // from pulling arbitrary files into a published asset.
      if (!fontPath.startsWith(stylesheetDir + path.sep)) {
        return null;
      }
      return fs.existsSync(fontPath) ? fs.readFileSync(fontPath) : null;
    },
  );
}

/**
 * @returns {import('vite').Plugin} a plugin that emits `maidr-math.css`, plus a
 * placeholder `maidr.css` when the bundle produced no stylesheet of its own
 */
export function mathStylesheet() {
  /** @type {{ css: string, inlined: number, rewritten: number, skipped: number } | null} */
  let prepared = null;

  return {
    name: 'maidr:math-stylesheet',
    // Same reason as woff2OnlyFonts: run after vite:css-post, so the bundle's
    // own CSS asset exists by the time the placeholder decision is made.
    enforce: 'post',
    apply: 'build',

    generateBundle(_options, bundle) {
      // Read once per process, not once per output: a bundle built for both
      // `es` and `umd` runs this hook twice and would otherwise base64 the
      // fonts twice for a byte-identical result.
      if (!prepared) {
        prepared = readMathStylesheet();
        if (prepared.skipped > 0) {
          this.warn(
            `${MATH_STYLESHEET_FILENAME}: ${prepared.skipped} @font-face rule(s) offer no `
            + 'woff2 source; their legacy formats were inlined so maths still renders.',
          );
        }
        this.info(
          `${MATH_STYLESHEET_FILENAME}: inlined ${prepared.inlined} font file(s) from `
          + `${prepared.rewritten} trimmed @font-face rule(s), `
          + `${(Buffer.byteLength(prepared.css) / 1024).toFixed(1)} kB total`,
        );
      }

      this.emitFile({
        type: 'asset',
        fileName: MATH_STYLESHEET_FILENAME,
        source: prepared.css,
      });

      if (!bundle[CORE_STYLESHEET_FILENAME]) {
        this.emitFile({
          type: 'asset',
          fileName: CORE_STYLESHEET_FILENAME,
          source: CORE_STYLESHEET_PLACEHOLDER,
        });
      }
    },
  };
}
