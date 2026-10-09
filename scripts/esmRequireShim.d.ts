/**
 * Hand-written declarations for `esmRequireShim.js`, which is plain JS so
 * `scripts/build.js` (run directly by node) can import it. Keep both files in
 * sync.
 */

/** The text of the error rolldown's CommonJS `require` shim throws. */
export declare const REQUIRE_SHIM_MARKER: string;

/** An ESM bundle that reaches the shim, and the file that carries it. */
export interface RequireShimOffender {
  bundle: string;
  chunk: string;
}

/** Find the ESM bundles in `distDir` that reach the `require` shim. */
export declare function findRequireShimBundles(distDir: string): RequireShimOffender[];

/** Throw when any ESM bundle in `distDir` reaches the `require` shim. */
export declare function assertNoRequireShim(distDir: string): void;
