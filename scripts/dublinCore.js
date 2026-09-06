/**
 * Dublin Core meta tags for the documentation site.
 *
 * Reference managers read a page's bibliographic details from embedded meta
 * tags. Zotero's Embedded Metadata translator looks for Highwire Press
 * `citation_*` tags first, then Dublin Core, then Open Graph, and finally
 * falls back to `<title>` with no author and no date.
 *
 * We deliberately do not emit `citation_*`. Google Scholar's inclusion
 * guidelines reserve those tags for scholarly articles and say the tags must
 * not be used for a repository or a site name, so putting them on software
 * documentation misrepresents the page and risks the site being dropped from
 * Scholar. Dublin Core carries the same facts without claiming the page is a
 * paper, and it is what Zotero reads next.
 *
 * The MAIDR papers stay where they belong: cited by DOI in the page's JSON-LD
 * and in the visible citation section, indexed in Scholar through their
 * publishers.
 */

/** Publisher of all three MAIDR sites. */
export const PUBLISHER
  = '(x)Ability Design Lab, University of Illinois Urbana-Champaign';

/**
 * Authors, surname-first so Zotero splits them into first and last names
 * rather than treating the whole string as a single-field name.
 */
export const CREATORS = ['Seo, JooYoung'];

/** SPDX identifier, matching `license` in package.json. */
export const RIGHTS = 'GPL-3.0-or-later';

/** Separators the page titles put between a page name and the site name. */
const TITLE_SEPARATORS = [' - ', ' | ', ' – ', ' — ', ' • '];

/**
 * Drop the trailing site name from a page title.
 *
 * `<title>`, `og:title` and `twitter:title` all carry the suffix, which is
 * right for a browser tab and a link preview. A bibliographic record is not
 * either of those: a reference manager should file the page under its own
 * title, the way it does for the sibling py-maidr and r-maidr sites, whose
 * generators append their own suffixes.
 *
 * Only an exact `<separator><siteName>` ending is removed, so a title that
 * merely contains a separator keeps all of it.
 *
 * @param {string} title
 * @param {string} siteName
 * @returns {string} `title` without its trailing site name.
 */
export function stripSiteName(title, siteName) {
  if (!siteName) {
    return title;
  }
  for (const separator of TITLE_SEPARATORS) {
    const suffix = `${separator}${siteName}`;
    if (title.endsWith(suffix) && title.length > suffix.length) {
      return title.slice(0, -suffix.length);
    }
  }
  return title;
}

/**
 * Escape a value for an HTML attribute.
 *
 * @param {string} value
 * @returns {string} `value` with `&`, `<`, `>` and `"` replaced by entities.
 */
function attr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the Dublin Core name/value pairs for one page.
 *
 * `type` is a Dublin Core Type Vocabulary term. The home page describes the
 * library itself and so is `Software`; every other page is documentation about
 * it and is `Text`. Claiming `Software` site-wide would tell a reference
 * manager that a guide page is the program.
 *
 * @param {object} opts
 * @param {string} opts.title        Page title as it appears in `<title>`;
 *   any trailing `opts.siteName` is stripped for the record.
 * @param {string} opts.description  Same text as the meta description.
 * @param {string} opts.identifier   Canonical URL of the page.
 * @param {string} [opts.siteName]   Site name the title is suffixed with.
 * @param {string} [opts.date]       ISO date the page was last changed.
 * @param {'Software' | 'Text'} [opts.type]
 * @param {string[]} [opts.creators]
 * @returns {[string, string][]} `[name, content]` pairs in document order.
 */
export function dublinCorePairs({
  title,
  description,
  identifier,
  siteName = '',
  date = '',
  type = 'Text',
  creators = CREATORS,
}) {
  const pairs = [
    ['DC.title', stripSiteName(title, siteName)],
    ...creators.map(creator => ['DC.creator', creator]),
    ['DC.publisher', PUBLISHER],
    ['DC.description', description],
    ['DC.identifier', identifier],
    ['DC.type', type],
    ['DC.format', 'text/html'],
    ['DC.language', 'en'],
    ['DC.rights', RIGHTS],
  ];
  if (date) {
    pairs.push(['DC.date', date]);
  }
  return pairs;
}

/**
 * The same tags rendered as HTML, for the string-templated site pages.
 *
 * TypeDoc builds its head with JSX instead, so that renderer consumes
 * {@link dublinCorePairs} directly rather than parsing this back.
 *
 * @param {Parameters<typeof dublinCorePairs>[0]} opts
 * @returns {string} Newline-joined `<meta>` tags, indented for the template.
 */
export function dublinCoreTags(opts) {
  return dublinCorePairs(opts)
    .map(([name, content]) => `<meta name="${name}" content="${attr(content)}" />`)
    .join('\n  ');
}
