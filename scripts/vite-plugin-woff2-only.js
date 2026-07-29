/**
 * Vite plugin: drop every non-woff2 `@font-face` source from emitted CSS.
 *
 * `src/ui/components/TypingEffect.tsx` imports `katex/dist/katex.min.css` to
 * render LaTeX in AI chat responses. Vite's library mode inlines the fonts that
 * stylesheet references as base64 data URIs, and KaTeX ships each of its 20
 * faces three times over — woff2, woff and ttf:
 *
 *   src:url(...woff2) format("woff2"),url(...woff) format("woff"),
 *       url(...ttf) format("truetype")
 *
 * A browser downloads exactly one of those, so the other two are dead weight in
 * `dist/maidr.css` — 1,402 KB of the file's 1,425 KB was font data, and two
 * thirds of that was never going to be used. woff2 has been baseline since
 * Chrome 36, Safari 12, Firefox 39 and Edge 14, so the legacy alternatives are
 * pure duplication.
 *
 * This is written as a build-time transform rather than a vendored copy of
 * KaTeX's stylesheet so it keeps working across KaTeX upgrades.
 *
 * NOTE: several bundles emit a byte-identical `maidr.css`, and the parallel
 * build in `scripts/build.js` fails with "Merge collision" if they diverge.
 * Register this plugin for every bundle that emits CSS (it lives in the shared
 * `createViteConfig` factory for exactly that reason), never for a subset.
 */

import { Buffer } from 'node:buffer';

const FONT_FACE_RE = /(@font-face\s*\{)([^}]*)(\})/gi;

/** Matches a `format("woff2")` hint. */
const WOFF2_FORMAT_RE = /format\(\s*['"]?woff2['"]?\s*\)/i;

/** Matches a `url(...)` pointing at woff2, by file extension or data-URI mime. */
const WOFF2_URL_RE = /url\([^)]*\.woff2\b|url\(\s*['"]?data:[^;,)]*\/woff2[;,]/i;

/**
 * Matches a `url(...)` source that is recognisably a font in a pre-woff2
 * format, either via its `format()` hint or via its extension / data-URI mime.
 * Anything not matched here is left alone, so an unrecognised source (or a
 * `local(...)` alternative, which costs no bytes) is never discarded.
 */
const LEGACY_SOURCE_RE = new RegExp([
  String.raw`format\(\s*['"]?(?:woff|truetype|opentype|embedded-opentype|svg)['"]?\s*\)`,
  String.raw`url\([^)]*\.(?:woff|ttf|otf|eot)\b`,
  String.raw`url\(\s*['"]?data:[^;,)]*\/(?:woff|ttf|truetype|otf|opentype|vnd\.ms-fontobject)[;,]`,
].join('|'), 'i');

/**
 * Split `value` on occurrences of `separator` that sit outside parentheses.
 *
 * Naive splitting is wrong here: a `src` list is comma-separated, but every
 * inlined `url(data:font/woff2;base64,...)` contains both a comma and a
 * semicolon. Font `src` values never nest parentheses outside a `url()` or
 * `format()`, and base64 has no parentheses of its own, so tracking depth is
 * enough.
 *
 * @param {string} value
 * @param {string} separator single character
 * @returns {string[]} the segments, with the separators removed
 */
function splitTopLevel(value, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
    } else if (char === separator && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

/**
 * Classify one alternative of a `src` list.
 *
 * @param {string} source
 * @returns {'woff2' | 'legacy' | 'other'} `legacy` marks the ones safe to drop
 */
function classifySource(source) {
  if (WOFF2_FORMAT_RE.test(source) || WOFF2_URL_RE.test(source))
    return 'woff2';
  if (LEGACY_SOURCE_RE.test(source))
    return 'legacy';
  return 'other';
}

/**
 * Rewrite a single `@font-face` body, keeping only woff2 sources.
 *
 * A face is only rewritten when it actually offers a woff2 alternative; a face
 * without one is returned untouched, so this can never leave a face with
 * nothing to load. That is deliberately conservative — a KaTeX upgrade that
 * drops woff2 from some face would grow the bundle back rather than break
 * rendering, and the caller reports the skip.
 *
 * @param {string} body declarations between the braces
 * @returns {{ body: string, rewritten: boolean, skipped: boolean }} the new
 * body, plus whether it was trimmed and whether it lacked a woff2 alternative
 */
function rewriteFontFaceBody(body) {
  let rewritten = false;
  let skipped = false;

  const declarations = splitTopLevel(body, ';').map((declaration) => {
    const colon = splitTopLevel(declaration, ':');
    if (colon.length < 2 || colon[0].trim().toLowerCase() !== 'src')
      return declaration;

    const property = colon[0];
    const value = colon.slice(1).join(':');
    const sources = splitTopLevel(value, ',')
      .filter(s => s.trim() !== '')
      .map(s => ({ source: s, kind: classifySource(s) }));
    if (sources.length === 0)
      return declaration;

    if (!sources.some(s => s.kind === 'woff2')) {
      skipped = true;
      return declaration;
    }

    const kept = sources.filter(s => s.kind !== 'legacy');
    // Guaranteed by the woff2 check above, but assert rather than assume:
    // emitting an empty `src` would silently break maths rendering.
    if (kept.length === 0) {
      throw new Error(
        `refusing to empty the src of an @font-face: ${body.slice(0, 120)}`,
      );
    }
    if (kept.length === sources.length)
      return declaration;

    rewritten = true;
    return `${property}:${kept.map(s => s.source).join(',')}`;
  });

  return { body: declarations.join(';'), rewritten, skipped };
}

/**
 * Strip non-woff2 `@font-face` sources from a stylesheet.
 *
 * @param {string} css
 * @returns {{ css: string, rewritten: number, skipped: number }} `rewritten` is
 * the number of faces trimmed, `skipped` the number left alone for lack of a
 * woff2 alternative.
 */
export function stripNonWoff2FontSources(css) {
  let rewritten = 0;
  let skipped = 0;

  const out = css.replace(FONT_FACE_RE, (_match, open, body, close) => {
    const result = rewriteFontFaceBody(body);
    if (result.rewritten)
      rewritten++;
    if (result.skipped)
      skipped++;
    return `${open}${result.body}${close}`;
  });

  return { css: out, rewritten, skipped };
}

/**
 * @returns {import('vite').Plugin} a plugin that applies the above to every
 * CSS asset in the bundle
 */
export function woff2OnlyFonts() {
  return {
    name: 'maidr:woff2-only-fonts',
    // Run after vite:css-post has assembled and emitted the CSS asset.
    enforce: 'post',
    apply: 'build',

    generateBundle(_options, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== 'asset' || !fileName.endsWith('.css'))
          continue;

        const before = typeof output.source === 'string'
          ? output.source
          : Buffer.from(output.source).toString('utf8');
        const { css, rewritten, skipped } = stripNonWoff2FontSources(before);
        if (skipped > 0) {
          this.warn(
            `${fileName}: ${skipped} @font-face rule(s) offer no woff2 source; `
            + 'their legacy formats were kept so text still renders.',
          );
        }
        if (rewritten === 0)
          continue;

        output.source = css;
        const saved = Buffer.byteLength(before) - Buffer.byteLength(css);
        this.info(
          `${fileName}: dropped non-woff2 sources from ${rewritten} @font-face `
          + `rule(s), saving ${(saved / 1024).toFixed(1)} kB`,
        );
      }
    },
  };
}
