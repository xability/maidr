/**
 * Markdown rendering for the documentation site, with GitHub-compatible
 * heading ids.
 *
 * **Why this file exists.** marked v15 emits no heading `id` attributes: the
 * `headerIds` option left marked core for the `marked-gfm-heading-id`
 * extension, which this repository does not depend on. `scripts/build-site.js`
 * upgraded across that boundary and nothing failed, because a link to a missing
 * fragment is not an error — the browser simply does not move. Every
 * table-of-contents link in `README.md` and `docs/` had been pointing at
 * nothing on maidr.ai (#913).
 *
 * It is split out of the build script rather than living beside the rest of it
 * because `build-site.js` writes files on import: nothing can load it to ask
 * what a heading turns into. This module is inert, so the slug rule and the
 * anchors it has to satisfy are testable — see
 * `test/scripts/siteAnchors.esm-test.ts`.
 *
 * **Why the rule has to be GitHub's.** The same files are read on github.com
 * and on maidr.ai, and they carry one set of `[…](#…)` links for both. A slug
 * rule of our own would work in one place and not the other, so the target is
 * `github-slugger`'s output rather than anything more principled — including
 * the parts of it that look like bugs, which are relied on by links that
 * already exist.
 */

import { Marked } from 'marked';

/**
 * Everything GitHub drops from a slug: anything that is not a letter, a number,
 * a combining mark, a space, an underscore or an ASCII hyphen.
 *
 * The hyphen is spelled out rather than taken from `\p{Pd}` on purpose. That
 * category also holds the em dash, and `docs/` uses em dashes in nine
 * headings — `## 4. KDE Layer — \`violin_kde\`` among them — where GitHub drops
 * the dash and keeps the two spaces around it, giving the doubled hyphen in
 * `#4-kde-layer--violin_kde`. Keeping `\p{Pd}` would produce a single hyphen
 * and break that link.
 */
const DISCARDED = /[^\p{L}\p{N}\p{M} _-]/gu;

/**
 * Convert heading text to a GitHub heading slug.
 *
 * Lower-case, drop everything in {@link DISCARDED}, then turn each remaining
 * space into a hyphen — each, not each run, which is why `## Live & Streaming
 * Data` is `#live--streaming-data` and not `#live-streaming-data`.
 *
 * Characters are dropped rather than replaced, so `` `embed(target, spec)` ``
 * slugs to `embedtarget-spec`: the bracket vanishes and closes the gap while
 * the comma leaves its following space behind. That reads like a mistake and
 * is what GitHub does, so it is what links have to be written against.
 * @param {string} text - Heading text, with markdown already resolved to plain
 * text (a code span contributes its contents, not its backticks).
 * @returns {string} The slug, which is empty when the heading holds nothing
 * that survives — a heading of one emoji, say.
 */
export function slugify(text) {
  return text.toLowerCase().replace(DISCARDED, '').replace(/ /g, '-');
}

/**
 * Create a slug allocator that disambiguates repeats within one document.
 *
 * GitHub numbers repeats in document order — `setup`, `setup-1`, `setup-2` —
 * and keeps searching when the numbered form is itself taken, so a document
 * with two `Bar Chart` headings and a literal `Bar Chart 1` produces
 * `bar-chart`, `bar-chart-1`, then `bar-chart-1-1` rather than silently
 * colliding. `docs/BRAILLE.md` alone repeats `### Multiline Displays` thirty
 * times, so this is the common case here rather than an edge one.
 *
 * One allocator per document: ids only have to be unique within a page, and
 * sharing one across pages would number the second page's headings as though
 * they were repeats.
 * @returns {(text: string) => string} Allocator, to be called once per heading
 * in document order.
 */
export function createHeadingSlugger() {
  /** Every slug handed out, and for each base the highest suffix used. */
  const used = new Map();

  return (text) => {
    const base = slugify(text);
    let slug = base;
    while (used.has(slug)) {
      const next = (used.get(base) ?? 0) + 1;
      used.set(base, next);
      slug = `${base}-${next}`;
    }
    used.set(slug, 0);
    return slug;
  };
}

/**
 * Render a markdown document to HTML for the site, giving each heading an id.
 *
 * A fresh `Marked` instance per call rather than the shared `marked` export,
 * because the heading renderer closes over a slug allocator that must not
 * outlive the document.
 * @param {string} markdown - The markdown source.
 * @returns {string} HTML, with every heading carrying its GitHub slug as `id`.
 */
export function renderMarkdown(markdown) {
  const nextSlug = createHeadingSlugger();
  const marked = new Marked({ gfm: true, breaks: false });

  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        // `textRenderer` flattens the inline tokens to their text content, which
        // is what GitHub slugs: a code span gives up its backticks, a link its
        // URL, and `&` arrives as itself rather than as `&amp;`. Slugging the
        // raw markdown instead would turn `## Live & Streaming Data` into
        // `live-amp-streaming-data` once the entity had been escaped.
        const id = nextSlug(this.parser.parseInline(tokens, this.parser.textRenderer));
        const body = this.parser.parseInline(tokens);
        // A heading whose text is entirely dropped — one emoji, say — gets no
        // id rather than `id=""`, which is not a thing a fragment can address.
        return `<h${depth}${id ? ` id="${id}"` : ''}>${body}</h${depth}>\n`;
      },
    },
  });

  // `parse` is synchronous unless an async extension is registered, and none is.
  return /** @type {string} */ (marked.parse(markdown));
}
