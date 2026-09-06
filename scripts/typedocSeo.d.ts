/**
 * Hand-written declarations for `typedocSeo.js`.
 *
 * The module is plain JS so `scripts/typedoc-seo-plugin.mjs` (loaded by
 * TypeDoc) can import it; `tsconfig.json` sets `allowJs: false`, so a
 * TypeScript test needs these to import it too. Keep both files in sync.
 */

/** Longest description that still fits a search snippet. */
export const MAX_DESCRIPTION: number;

/** A page TypeDoc renders for the project itself rather than for a symbol. */
export interface ProjectPage {
  /** Its heading, or null to keep TypeDoc's own for the index. */
  title: string | null;
  description: string;
}

/** Project pages keyed by their TypeDoc output path. */
export const PROJECT_PAGES: Record<string, ProjectPage>;

/** Cut a description at a word boundary so it fits a search snippet. */
export function truncate(text: string): string;

/** The description for a symbol with no doc comment. */
export function fallbackDescription(kind: string, name: string, moduleName?: string): string;
