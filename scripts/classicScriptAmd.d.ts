/**
 * Hand-written declarations for `classicScriptAmd.js`, which is plain JS so
 * `scripts/build.js` (run directly by node) can import it. Keep both files in
 * sync.
 */

/** A classic script that would not run under an AMD loader, and why. */
export interface ClassicScriptAmdProblem {
  file: string;
  problem: string;
}

/** The AMD name a classic script registers itself under. */
export declare function amdNameOf(fileName: string): string;

/** Find what is wrong with the classic scripts in `distDir`. */
export declare function findClassicScriptAmdProblems(distDir: string): ClassicScriptAmdProblem[];

/** Throw when a classic script in `distDir` would not run under an AMD loader. */
export declare function assertClassicScriptsRunWithoutAmd(distDir: string): void;
