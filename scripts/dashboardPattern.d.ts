/**
 * Hand-written declarations for `dashboardPattern.js`, which is plain JS so
 * `scripts/build.js` (run directly by node) can import it. Keep both files in
 * sync.
 */

/** The text Quarto's dashboard filter matches. */
export declare const DASHBOARD_PATTERN_TEXT: string;

/** Find the bundles in `distDir` that contain the text. */
export declare function findDashboardPatternBundles(distDir: string): string[];

/** Throw when any bundle in `distDir` contains the text. */
export declare function assertNoDashboardPattern(distDir: string): void;
