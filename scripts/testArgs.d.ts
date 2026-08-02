/**
 * Hand-written declarations for `testArgs.js`.
 *
 * The module is plain JS so `scripts/test.js` (run directly by node) can import
 * it; `tsconfig.json` sets `allowJs: false`, so a TypeScript test needs these
 * to import it too. Keep both files in sync.
 */

/** Split `--selectProjects` out of an argument list. */
export declare function takeSelection(args: string[]): {
  rest: string[];
  selected: string[];
};

/** Whether any argument could be a path filter rather than a flag. */
export declare function hasPathFilter(args: string[]): boolean;

/** Whether a project matching no tests should be tolerated. */
export declare function isNarrowed(
  matched: string[] | null,
  everything: string[] | null,
): boolean;
