/**
 * Hand-written declarations for `scripts/siteLinks.js`.
 *
 * The same arrangement as `scripts/markdown.d.ts`: the module is plain ESM run
 * directly by node from `scripts/build-site.js`, and `tsconfig.json` sets
 * `allowJs: false`, so a test can only import it with declarations beside it.
 * `test/scripts/siteLinks.esm-test.ts` checks these against what the module
 * actually returns, since `tsc` never sees the JavaScript.
 */

/** An integration guide built as a root-level page. */
export interface IntegrationPage {
  slug: string;
  title: string;
  source: string;
}

/** The integration guides built as root-level pages. */
export declare const INTEGRATION_PAGES: readonly IntegrationPage[];

/** The site path of the page built from a markdown source, or null if none is. */
export declare function builtPagePath(source: string): string | null;

/** Point every link to another markdown source at the page built from it. */
export declare function rewriteMarkdownLinks(html: string, source: string): string;
