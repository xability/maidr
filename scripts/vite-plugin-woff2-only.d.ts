import type { Plugin } from 'vite';

/**
 * Hand-written declarations for `vite-plugin-woff2-only.js`.
 *
 * The plugin is plain JS so `scripts/build.js` (run directly by node) can
 * import it; `tsconfig.json` sets `allowJs: false`, so `vite.config.ts` needs
 * these types to import it too. Keep both files in sync.
 */

/**
 * Strip non-woff2 `@font-face` sources from a stylesheet. Faces that offer no
 * woff2 alternative are left untouched and counted in `skipped`.
 */
export declare function stripNonWoff2FontSources(css: string): {
  css: string;
  rewritten: number;
  skipped: number;
};

/** Vite plugin that applies the above to every emitted CSS asset. */
export declare function woff2OnlyFonts(): Plugin;
