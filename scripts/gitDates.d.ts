/**
 * Hand-written declarations for `gitDates.js`.
 *
 * The module is plain JS so `scripts/build-site.js` (run directly by node) can
 * import it; `tsconfig.json` sets `allowJs: false`, so a TypeScript test needs
 * these to import it too. Keep both files in sync.
 */

/** Trimmed stdout of `git <args>` run in `cwd`, or `''` when it fails. */
export function git(cwd: string, args: string[]): string;

/** Date (YYYY-MM-DD) of the last commit touching `relPath`, else `fallback`. */
export function lastCommitDate(cwd: string, relPath: string, fallback: string): string;

/**
 * Date of the commit that added `relPath`, followed across renames, else its
 * last commit date, else `fallback`.
 */
export function firstCommitDate(cwd: string, relPath: string, fallback: string): string;
