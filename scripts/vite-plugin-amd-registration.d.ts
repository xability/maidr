import type { Plugin } from 'vite';

/**
 * Hand-written declarations for `vite-plugin-amd-registration.js`, which is
 * plain JS so `scripts/build.js` (run directly by node) can import it. Keep
 * both files in sync.
 */

/**
 * The registration a classic script makes once it has run: anonymous when
 * require.js is loading the script, under `amdName` otherwise. `value` is a
 * function expression returning the module.
 */
export declare function registration(amdName: string, value: string): string;

/**
 * Rewrite rolldown's UMD wrapper so the bundle never waits on an AMD loader:
 * no AMD branch, and the registration once it has run. Throws when the chunk
 * does not open with the wrapper expected.
 */
export declare function withoutAmdBranch(code: string, globalName: string, amdName: string): string;

/** Append the registration to an IIFE with no exports. */
export declare function withRegistration(code: string, amdName: string): string;

/**
 * Vite plugin that registers the entry chunk of an `iife` output, and of a
 * `umd` output with exports, with an AMD loader once it has run.
 */
export declare function amdRegistration(amdName: string | undefined): Plugin;
