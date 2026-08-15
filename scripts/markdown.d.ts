/**
 * Hand-written declarations for `scripts/markdown.js`.
 *
 * The same arrangement as `scripts/testArgs.d.ts`: the module is plain ESM run
 * directly by node from `scripts/build-site.js`, and `tsconfig.json` sets
 * `allowJs: false`, so a test can only import it with declarations beside it.
 * `test/scripts/siteAnchors.esm-test.ts` checks these against what the module
 * actually returns, since `tsc` never sees the JavaScript.
 */

/** Convert heading text to a GitHub heading slug. */
export declare function slugify(text: string): string;

/** Create a slug allocator that disambiguates repeats within one document. */
export declare function createHeadingSlugger(): (text: string) => string;

/** Render a markdown document to HTML, giving each heading its GitHub slug as `id`. */
export declare function renderMarkdown(markdown: string): string;
