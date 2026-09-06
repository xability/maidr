/**
 * Hand-written declarations for `pageSizes.js`.
 *
 * The module is plain JS so `scripts/check-page-sizes.js` (run directly by
 * node) can import it; `tsconfig.json` sets `allowJs: false`, so a TypeScript
 * test needs these to import it too. Keep both files in sync.
 */

/** Limit for ordinary pages: Googlebot's 2 MB cutoff with headroom. */
export const SOFT_LIMIT: number;

/** Googlebot's cutoff itself, applied to `api/` pages. */
export const HARD_LIMIT: number;

/** A built page: path relative to `_site/` and size in bytes. */
export interface PageSize {
  file: string;
  size: number;
}

/** A page over its limit. */
export interface Offender extends PageSize {
  limit: number;
}

/** The byte limit for a page path, or null when the page is exempt. */
export function limitFor(file: string): number | null;

/** The pages over their limit, each with the limit it broke. */
export function findOffenders(pages: PageSize[]): Offender[];
