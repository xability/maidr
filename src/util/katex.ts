import { detectMaidrSource } from './diagnostics';

/**
 * On-demand loading of KaTeX's stylesheet.
 *
 * KaTeX exists in MAIDR for one reason: rendering LaTeX in AI chat responses.
 * Its stylesheet carries 20 font faces inlined as base64, which is ~340 kB —
 * and until this module existed every page that loaded MAIDR downloaded all of
 * it, whether or not the reader ever opened the chat and whether or not any
 * response contained maths.
 *
 * So `scripts/vite-plugin-math-stylesheet.js` publishes it separately as
 * `maidr-math.css`, and {@link ensureKatexStylesheet} links it the first time a
 * response actually needs it. The fonts stay inlined in that file rather than
 * moving to external `.woff2` files, because sandboxed embedding contexts
 * commonly allow a CDN for `style-src` but not for `font-src`.
 */

declare global {
  interface Window {
    /**
     * Absolute URL of `maidr-math.css`, for pages where it cannot be found
     * automatically — most often when MAIDR has been bundled into a host
     * application's own chunk, leaving no maidr script or stylesheet tag to
     * resolve against. Set it before the first AI chat response arrives.
     */
    maidrMathStylesheetUrl?: string;
  }
}

/** Name the build gives the maths stylesheet, alongside `maidr.js` in `dist`. */
export const MATH_STYLESHEET_FILENAME = 'maidr-math.css';

/** Marks the `<link>` this module adds, so a second call can recognise it. */
const MATH_STYLESHEET_ATTRIBUTE = 'data-maidr-math';

/**
 * Matches a pair of `$` delimiters — what `remark-math` treats as maths.
 *
 * Deliberately as loose as `remark-math` itself is: it parses `$5 and $` in
 * "costs $5 and $7" as maths too, so a stricter test here would leave those
 * responses rendering as unstyled markup. Being wrong in this direction costs
 * one stylesheet fetch on a message about prices; being wrong in the other
 * costs correct rendering of a genuine equation.
 */
const MATH_DELIMITER_PATTERN = /\$[^$]*\$/;

/** Matches the maths stylesheet's own URL, ignoring any query or fragment. */
const MATH_STYLESHEET_PATTERN = new RegExp(
  `(?:^|/)${MATH_STYLESHEET_FILENAME.replace('.', '\\.')}(?:$|[?#])`,
  'i',
);

/**
 * Matches the URL of a published MAIDR stylesheet — `maidr.css`, or one of the
 * per-adapter names should any ever ship. Mirrors the script-URL pattern in
 * `diagnostics.ts`: anything after "maidr" has to start at a separator, and the
 * separator and segment classes stay disjoint so the repetition cannot backtrack
 * super-linearly.
 */
const MAIDR_STYLESHEET_PATTERN = /(?:^|\/)maidr(?:[.-]\w+)*\.css(?:$|[?#])/i;

/**
 * Reports whether a message needs KaTeX to render correctly.
 * @param text - The message body, as Markdown.
 * @returns True when the text carries a pair of `$` maths delimiters.
 */
export function containsLatex(text: string): boolean {
  return MATH_DELIMITER_PATTERN.test(text);
}

/**
 * Finds the URL of a MAIDR stylesheet already linked by the page.
 *
 * Used as the second signal for locating `dist`, because it is the one that
 * survives when MAIDR is loaded as an ES module through a host bundler: the
 * `<script>` tag stops being attributable long before the `<link>` does.
 * @returns The stylesheet's absolute URL, or `null` if none is linked.
 */
function findMaidrStylesheetUrl(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]');
  for (const link of links) {
    if (MAIDR_STYLESHEET_PATTERN.test(link.href)) {
      return link.href;
    }
  }
  return null;
}

/**
 * Works out where `maidr-math.css` is served from.
 *
 * The stylesheet ships in the same directory as `maidr.js` and `maidr.css`, so
 * either of those, wherever the page loaded it from — a CDN, the site's own
 * assets, a `file://` export — locates it. An explicit
 * `window.maidrMathStylesheetUrl` wins over both, for the pages where neither
 * can be found.
 * @returns The absolute URL to link, or `null` when `dist` cannot be located.
 */
export function resolveMathStylesheetUrl(): string | null {
  const override = typeof window === 'undefined' ? undefined : window.maidrMathStylesheetUrl;
  if (override) {
    return override;
  }

  const base = detectMaidrSource().url ?? findMaidrStylesheetUrl();
  if (!base) {
    return null;
  }

  try {
    return new URL(MATH_STYLESHEET_FILENAME, base).href;
  } catch {
    // Unreachable via `script.src` / `link.href`, which the DOM resolves to
    // absolute URLs. Reporting "not found" beats linking a malformed href.
    return null;
  }
}

/** Whether some stylesheet on the page is already the maths one. */
function isAlreadyLinked(): boolean {
  if (document.querySelector(`link[${MATH_STYLESHEET_ATTRIBUTE}]`)) {
    return true;
  }
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]');
  for (const link of links) {
    if (MATH_STYLESHEET_PATTERN.test(link.href)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether this module has already decided what to do, so that a chat full of
 * equations resolves the URL and warns at most once.
 */
let resolved = false;

/**
 * Links `maidr-math.css` into the document, once per page.
 *
 * Failing to find it is not fatal: KaTeX still emits MathML alongside its
 * markup, so a screen reader reads the equation either way — the loss is
 * visual. That is why an unresolvable URL warns and returns instead of
 * throwing, and why nothing here blocks rendering on the stylesheet loading.
 */
export function ensureKatexStylesheet(): void {
  if (resolved || typeof document === 'undefined') {
    return;
  }
  resolved = true;

  // A page can carry two copies of MAIDR (a chart bundle plus an adapter), and
  // an integrator may have preloaded the stylesheet themselves. Either way the
  // rules are already there, so adding a second <link> only costs a fetch.
  if (isAlreadyLinked()) {
    return;
  }

  const href = resolveMathStylesheetUrl();
  if (!href) {
    console.warn(
      `[maidr] could not locate ${MATH_STYLESHEET_FILENAME}, so maths in AI chat `
      + 'responses will render unstyled. Set window.maidrMathStylesheetUrl to its '
      + 'URL — it ships next to maidr.js.',
    );
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute(MATH_STYLESHEET_ATTRIBUTE, '');
  document.head.appendChild(link);
}
