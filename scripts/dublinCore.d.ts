/**
 * Hand-written declarations for `dublinCore.js`.
 *
 * The module is plain JS so `scripts/build-site.js` (run directly by node) and
 * `scripts/typedoc-seo-plugin.mjs` (loaded by TypeDoc) can import it;
 * `tsconfig.json` sets `allowJs: false`, so a TypeScript test needs these to
 * import it too. Keep both files in sync.
 */

/** Publisher of all three MAIDR sites. */
export const PUBLISHER: string;

/** Authors, surname-first so Zotero splits them into first and last names. */
export const CREATORS: string[];

/** SPDX identifier, matching `license` in package.json. */
export const RIGHTS: string;

/** `title` without a trailing `separator + siteName`. */
export function stripSiteName(title: string, siteName: string): string;

/** Dublin Core `[name, content]` pairs for one page, in document order. */
export function dublinCorePairs(opts: {
  title: string;
  description: string;
  identifier: string;
  siteName?: string;
  date?: string;
  type?: 'Software' | 'Text';
  creators?: string[];
}): [string, string][];

/** The same tags rendered as HTML, newline-joined and indented. */
export function dublinCoreTags(opts: {
  title: string;
  description: string;
  identifier: string;
  siteName?: string;
  date?: string;
  type?: 'Software' | 'Text';
  creators?: string[];
}): string;
