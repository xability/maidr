/**
 * Hand-written declarations for `jsonLd.js`.
 *
 * The module is plain JS so `scripts/build-site.js` (run directly by node) and
 * `scripts/typedoc-seo-plugin.mjs` (loaded by TypeDoc) can import it;
 * `tsconfig.json` sets `allowJs: false`, so a TypeScript test needs these to
 * import it too. Keep both files in sync.
 */

/** `value` as JSON safe to inline in a script tag, indented by `space`. */
export function inlineJson(value: unknown, space?: number | string): string;
