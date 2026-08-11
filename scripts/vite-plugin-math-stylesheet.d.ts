import type { Plugin } from 'vite';

/**
 * Hand-written declarations for `vite-plugin-math-stylesheet.js`.
 *
 * The plugin is plain JS so `scripts/build.js` (run directly by node) can
 * import it; `tsconfig.json` sets `allowJs: false`, so `vite.config.ts` needs
 * these types to import it too. Keep both files in sync.
 */

/** Name of the on-demand maths stylesheet in `dist`. */
export declare const MATH_STYLESHEET_FILENAME: string;

/** Name of the stylesheet every integration already links. */
export declare const CORE_STYLESHEET_FILENAME: string;

/** What `dist/maidr.css` contains once KaTeX has moved out of it. */
export declare const CORE_STYLESHEET_PLACEHOLDER: string;

/** Rewrite every relative `url(...)` in a stylesheet as a base64 `data:` URI. */
export declare function inlineFontUrls(
  css: string,
  readFont: (specifier: string) => Uint8Array | null,
): { css: string; inlined: number };

/** Trim a stylesheet to woff2-only sources and inline every one of them. */
export declare function buildMathStylesheet(
  css: string,
  readFont: (specifier: string) => Uint8Array | null,
): { css: string; inlined: number; rewritten: number; skipped: number };

/** Read KaTeX's stylesheet from `node_modules` and prepare it for `dist`. */
export declare function readMathStylesheet(): {
  css: string;
  inlined: number;
  rewritten: number;
  skipped: number;
};

/** Vite plugin that emits `maidr-math.css` and a placeholder `maidr.css`. */
export declare function mathStylesheet(): Plugin;
