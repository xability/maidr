/**
 * Hand-written declarations for `classicScriptAmd.js`, which is plain JS so
 * `scripts/build.js` (run directly by node) can import it. Keep both files in
 * sync.
 */

/** A classic script a build writes, and the AMD name it registers. */
export interface ClassicScript {
  file: string;
  format: string;
  amdName: string | null;
}

/** A classic script that would not run under an AMD loader, and why. */
export interface ClassicScriptAmdProblem {
  file: string;
  problem: string;
}

/** The classic scripts a set of builds writes: every output not an ES module. */
export declare function classicScripts(configs: Array<{
  entry: string;
  formats?: string[];
  fileName: unknown;
  amdName?: string;
}>): ClassicScript[];

/** Find what is wrong with the given classic scripts in `distDir`. */
export declare function findClassicScriptAmdProblems(distDir: string, scripts: ClassicScript[]): ClassicScriptAmdProblem[];

/** Throw when a classic script in `distDir` would not run under an AMD loader. */
export declare function assertClassicScriptsRunWithoutAmd(distDir: string, scripts: ClassicScript[]): void;
