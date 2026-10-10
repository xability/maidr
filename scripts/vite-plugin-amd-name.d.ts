import type { Plugin } from 'vite';

/**
 * Hand-written declarations for `vite-plugin-amd-name.js`, which is plain JS
 * so `scripts/build.js` (run directly by node) can import it. Keep both files
 * in sync.
 */

/** The line appended to a classic script, registering it as `name`. */
export declare function amdRegistration(name: string): string;

/**
 * Vite plugin that appends {@link amdRegistration} to the entry chunk of an
 * `iife` output.
 */
export declare function amdModuleName(name: string): Plugin;
