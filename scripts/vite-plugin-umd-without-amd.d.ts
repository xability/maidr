import type { Plugin } from 'vite';

/**
 * Hand-written declarations for `vite-plugin-umd-without-amd.js`, which is
 * plain JS so `scripts/build.js` (run directly by node) can import it. Keep
 * both files in sync.
 */

/**
 * Rewrite rolldown's UMD wrapper so the bundle never waits on an AMD loader:
 * no AMD branch, and a registration once it has run -- anonymous when
 * require.js is loading the script, under `amdName` otherwise. Throws when the
 * chunk does not open with the wrapper expected.
 */
export declare function withoutAmdBranch(code: string, globalName: string, amdName: string): string;

/** Vite plugin that applies the above to the entry chunk of a `umd` output. */
export declare function umdWithoutAmd(amdName: string | undefined): Plugin;
