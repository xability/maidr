/**
 * Hand-written declarations for `scripts/conflictMarkers.js`.
 *
 * The same arrangement as `scripts/markdown.d.ts`: the module is plain ESM run
 * directly by node, and `tsconfig.json` sets `allowJs: false`, so a test can
 * only import it with declarations beside it.
 * `test/scripts/conflictMarkers.esm-test.ts` checks these against what the
 * module actually returns, since `tsc` never sees the JavaScript.
 */

/** One marker line, as found in a file. */
export interface ConflictMarker {
  /** 1-based line number. */
  line: number;
  /** Which of the four markers this is. */
  name: 'ours' | 'base' | 'separator' | 'theirs';
  /** The line itself, without any trailing carriage return. */
  text: string;
}

/** One marker line, with the file it was found in. */
export interface ConflictMarkerHit extends ConflictMarker {
  /** Repository-relative path. */
  file: string;
}

/** Find the conflict markers in one file's text, in file order. */
export declare function conflictMarkersIn(text: string): ConflictMarker[];

/** List the repository's tracked files, as `git ls-files` reports them. */
export declare function trackedFiles(root?: string): string[];

/** Scan every tracked file for conflict markers, skipping binary files. */
export declare function findConflictMarkers(root?: string): ConflictMarkerHit[];
