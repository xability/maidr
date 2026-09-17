/**
 * Hand-written declarations for `siteOrigin.js`.
 *
 * The module is plain JS so `scripts/build-site.js` (run directly by node) and
 * `scripts/typedoc-seo-plugin.mjs` (loaded by TypeDoc) can import it;
 * `tsconfig.json` sets `allowJs: false`, so a TypeScript test needs these to
 * import it too. Keep both files in sync.
 */

/** The origin the site is built for when `SITE_ORIGIN` is not set. */
export const DEFAULT_SITE_ORIGIN: string;

/**
 * The site's base URL for `origin` (default: `process.env.SITE_ORIGIN`),
 * normalised to end in `/`. Empty means the default; a value that is not an
 * absolute http(s) URL throws.
 */
export function resolveSiteUrl(origin?: string | undefined): string;

/** The base URL of the site being built, with a trailing slash. */
export const SITE_URL: string;

/** The base URL of the API reference, which TypeDoc writes under `api/`. */
export const API_URL: string;
