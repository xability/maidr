/**
 * Where each markdown source lands on maidr.ai, and the rewrite that turns a
 * link between sources into a link between the pages built from them.
 *
 * **Why this file exists.** `README.md` and `docs/` are read in two places:
 * on github.com, where a link has to name the `.md` file, and on maidr.ai,
 * where the same file is an `.html` page and not always in the same
 * directory — the integration guides are built at the site root, not under
 * `docs/`. The build used to patch this by hand for the README alone: one
 * regex for `docs/*.md` and a second for the React guide, the only guide it
 * knew had moved. The Plotly guide link on the home page went to
 * `docs/plotly.html`, which does not exist (#1280), and nothing touched links
 * between the `docs/` pages at all, so `CONTROLS.md` → `TACTILE_DISPLAY.md`
 * shipped as a link to a `.md` file the site does not serve (#1281).
 *
 * The fix is to answer one question — where does this source land? — in one
 * place, and derive every link from it. The module is inert, unlike
 * `build-site.js`, which writes files on import, so
 * `test/scripts/siteLinks.esm-test.ts` can build every page's links the way
 * the build does and check that each one resolves.
 */

import path from 'node:path';

/**
 * The integration guides built as root-level pages.
 *
 * One list drives everything that used to be spelled out per integration:
 * the page build, the exclusion from the generic `docs/` loop (so a guide is
 * not built a second time under `docs/`), the sitemap, and where a link to a
 * guide points. Adding a guide is one line here; the nav link in
 * `docs/template.html` is still by hand.
 *
 * `slug` is the output filename without `.html` and the `activePage` key the
 * template's nav uses; `title` is the nav-facing title; `source` is the
 * markdown file under `docs/`.
 */
export const INTEGRATION_PAGES = [
  { slug: 'react', title: 'React', source: 'react.md' },
  { slug: 'recharts', title: 'Recharts', source: 'recharts.md' },
  { slug: 'plotly', title: 'Plotly', source: 'plotly.md' },
  { slug: 'google-charts', title: 'Google Charts', source: 'google-charts.md' },
  { slug: 'd3', title: 'D3.js', source: 'd3.md' },
  { slug: 'vegalite', title: 'Vega-Lite', source: 'vegalite.md' },
  { slug: 'chartjs', title: 'Chart.js', source: 'chartjs.md' },
  { slug: 'amcharts', title: 'amCharts', source: 'amcharts.md' },
  { slug: 'observable', title: 'Observable Plot', source: 'observable.md' },
  { slug: 'echarts', title: 'Apache ECharts', source: 'echarts.md' },
  { slug: 'frappe', title: 'Frappe Charts', source: 'frappe.md' },
  { slug: 'victory', title: 'Victory', source: 'victory.md' },
  { slug: 'anychart', title: 'AnyChart', source: 'anychart.md' },
  { slug: 'highcharts', title: 'Highcharts', source: 'highcharts.md' },
  { slug: 'tableau', title: 'Tableau', source: 'tableau.md' },
  { slug: 'lightweight-charts', title: 'Lightweight Charts', source: 'lightweight-charts.md' },
];

const SLUG_BY_SOURCE = new Map(INTEGRATION_PAGES.map(({ slug, source }) => [source, slug]));

/**
 * The site path of the page built from a markdown source.
 *
 * `README.md` is the home page, an integration guide is a root-level page
 * named by its slug, and every other `docs/*.md` is built beside itself under
 * `docs/`.
 * @param {string} source - Repository-relative path with forward slashes,
 * such as `README.md` or `docs/CONTROLS.md`.
 * @returns {string | null} The page's path relative to the site root, or null
 * for a markdown file the site does not build.
 */
export function builtPagePath(source) {
  if (source === 'README.md') {
    return 'index.html';
  }
  const match = /^docs\/([^/]+)\.md$/.exec(source);
  if (!match) {
    return null;
  }
  const slug = SLUG_BY_SOURCE.get(`${match[1]}.md`);
  return slug ? `${slug}.html` : `docs/${match[1]}.html`;
}

/** An `href` to a relative `.md` target, with its fragment kept apart. */
const MARKDOWN_HREF = /href="(?![a-z][a-z0-9+.-]*:|\/|#)([^"#?]+\.md)(#[^"]*)?"/gi;

/**
 * Point every link to another markdown source at the page built from it.
 *
 * A link is resolved against the directory of the source it is written in —
 * the way github.com reads it — then re-expressed relative to the directory
 * of the page that source is built into. So `docs/plotly.md` written in the
 * README becomes `plotly.html`, and `CONTROLS.md` written in
 * `docs/amcharts.md`, which is built at the root, becomes
 * `docs/CONTROLS.html`. A link to a markdown file the site does not build is
 * left alone, for the link check to report.
 * @param {string} html - Rendered HTML of `source`.
 * @param {string} source - Repository-relative path of the markdown the HTML
 * was rendered from.
 * @returns {string} The HTML with those links rewritten.
 */
export function rewriteMarkdownLinks(html, source) {
  const page = builtPagePath(source);
  if (!page) {
    throw new Error(`rewriteMarkdownLinks: ${source} is not a page the site builds`);
  }
  const sourceDir = path.posix.dirname(source);
  const pageDir = path.posix.dirname(page);
  return html.replace(MARKDOWN_HREF, (whole, target, fragment = '') => {
    const targetPage = builtPagePath(path.posix.normalize(path.posix.join(sourceDir, target)));
    if (!targetPage) {
      return whole;
    }
    return `href="${path.posix.relative(pageDir, targetPage)}${fragment}"`;
  });
}
