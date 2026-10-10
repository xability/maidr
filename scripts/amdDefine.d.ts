/**
 * Hand-written declarations for `amdDefine.js`, which is plain JS so
 * `scripts/build.js` (run directly by node) can import it. Keep both files in
 * sync.
 */

/** A classic script a build writes, and the AMD name it registers. */
export interface ClassicScript {
  file: string;
  amdName: string;
}

/** A classic script that would wait on an AMD loader, and why. */
export interface AmdDefineProblem {
  file: string;
  problem: string;
}

/** The classic scripts of every build that names an `amdName`. */
export declare function classicScripts(configs: Array<{
  entry: string;
  formats?: string[];
  fileName: unknown;
  amdName?: string;
}>): ClassicScript[];

/** Find what is wrong with the given classic scripts in `distDir`. */
export declare function findAmdDefineProblems(distDir: string, scripts: ClassicScript[]): AmdDefineProblem[];

/** Throw when a classic script in `distDir` would wait on an AMD loader. */
export declare function assertNoAnonymousDefine(distDir: string, scripts: ClassicScript[]): void;
