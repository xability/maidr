#!/usr/bin/env node

/**
 * Build script to generate the documentation site
 * - Creates index.html from README.md
 * - Creates one root page per integration guide (react.html, plotly.html, ...)
 * - Creates examples.html that embeds the examples
 * - Copies media and examples folders
 * - TypeDoc generates API docs separately
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGallery, listExamplePages, renderGallery } from './examplesGallery.js';
import { firstCommitDate as firstCommit, lastCommitDate as lastCommit } from './gitDates.js';
import { renderMarkdown } from './markdown.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.join(__dirname, '..');
const SITE_DIR = path.join(ROOT, '_site');
const TEMPLATE_PATH = path.join(ROOT, 'docs', 'template.html');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const SITE_URL = 'https://maidr.ai/';

// Ensure _site directory exists
if (!fs.existsSync(SITE_DIR)) {
  fs.mkdirSync(SITE_DIR, { recursive: true });
}

// Read template
const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

/**
 * Convert markdown to HTML for the site.
 *
 * `renderMarkdown` carries the marked configuration and the heading ids the
 * table-of-contents links need; see `scripts/markdown.js` for why the ids are
 * not marked's own.
 */
function markdownToHtml(md) {
  // Remove the centered logo div at the top of README
  const content = md.replace(/<div align="center">[\s\S]*?<\/div>\s*/, '');

  return renderMarkdown(content);
}

/**
 * The integration guides built as root-level pages.
 *
 * One list drives everything that used to be spelled out per integration:
 * the page build, the exclusion from the generic `docs/` loop (so a guide is
 * not built a second time under `docs/`), and the sitemap. Adding a guide is
 * one line here; the nav link in `docs/template.html` is still by hand.
 *
 * `slug` is the output filename without `.html` and the `activePage` key the
 * template's nav uses; `title` is the nav-facing title; `source` is the
 * markdown file under `docs/`.
 */
const INTEGRATION_PAGES = [
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
];

const INTEGRATION_SOURCES = new Set(INTEGRATION_PAGES.map(page => page.source));

/** Page titles for the `docs/*.md` files whose filename is not a title. */
const DOC_TITLES = {
  SCHEMA: 'Data Schema',
  BRAILLE: 'Braille Generation',
  CONTROLS: 'Keyboard Controls',
  LIVE_DATA: 'Live & Streaming Data',
  TACTILE_DISPLAY: 'Tactile Graphics Display',
  VIOLIN_PLOT_SPEC: 'Violin Plot Specification',
};

// Per-page SEO descriptions.
// Keys are either activePage slugs ('home', 'react', 'examples') or page titles
// ('Data Schema', etc.) for doc pages where activePage is '' and lookup falls back to title.
// Keep each one unique and roughly 70-160 characters; generatePage warns outside
// that range and fails the build when a page has no entry at all.
const PAGE_DESCRIPTIONS = {
  'home': 'MAIDR provides accessible, non-visual access to statistical charts through audio sonification, text descriptions, braille output, and AI-powered descriptions.',
  'react': 'How to integrate MAIDR accessible data visualizations into React applications with TypeScript support.',
  'recharts': 'How to integrate MAIDR accessibility features with Recharts React components for accessible data visualizations.',
  'plotly': 'How to make Plotly.js charts accessible with MAIDR: automatic support for bar, scatter, line, box, violin, heatmap, histogram, candlestick and pie charts.',
  'google-charts': 'How to make Google Charts accessible with MAIDR: support for bar, line, scatter, candlestick, stacked, dodged, and pie charts.',
  'd3': 'How to make D3.js charts accessible with MAIDR: binders for bar, line, scatter, box, heatmap, histogram, candlestick and pie charts, plus a React wrapper.',
  'vegalite': 'How to make Vega-Lite charts accessible with MAIDR: support for bar, stacked, dodged, normalized, histogram, line, scatter, heatmap, box and arc (pie) specs.',
  'chartjs': 'How to make Chart.js charts accessible with MAIDR: support for bar, line, scatter, stacked, dodged, box, candlestick, heatmap (matrix), pie and doughnut charts.',
  'amcharts': 'How to make amCharts 5 charts accessible with MAIDR: support for bar, dodged, stacked, normalized, line, histogram, heatmap, and pie chart types.',
  'observable': 'How to make Observable Plot charts accessible with MAIDR: one binding for bar, histogram, scatter, line, area and faceted plots, and for Quarto OJS cells.',
  'echarts': 'How to make Apache ECharts accessible with MAIDR: support for bar, stacked bar, dodged bar, line, area, step, and scatter series.',
  'frappe': 'How to make Frappe Charts accessible with MAIDR: support for bar, line, multi-line, scatter, mixed axis (bar + line), pie, and donut chart types.',
  'victory': 'How to make Victory charts accessible with MAIDR: support for bar, line, scatter, stacked, histogram, box plot, candlestick, and pie chart types.',
  'anychart': 'How to make AnyChart charts accessible with MAIDR: support for bar, line, step, scatter, box, heatmap, candlestick, and pie chart types via a one-line binder.',
  'highcharts': 'How to make Highcharts accessible with MAIDR: support for bar, line, scatter, box, heatmap, histogram, candlestick, stacked, dodged, normalized and pie charts.',
  'tableau': 'How to make embedded Tableau dashboards accessible with MAIDR: sonification, braille and screen-reader navigation for bar, line, scatter and pie worksheets.',
  'examples': 'Interactive examples of accessible bar plots, line charts, heatmaps, scatter plots, box plots, and more using MAIDR.',
  'Data Schema': 'The MAIDR JSON data schema: how to describe figures, subplots, layers, axes and data points for bar, box, heatmap, scatter, line and other chart types.',
  'Braille Generation': 'How MAIDR encodes bar, box, heatmap, line, scatter and other plots as braille characters for refreshable braille displays, with the rules for each plot type.',
  'Keyboard Controls': 'Keyboard controls reference for MAIDR: moving through data points, switching between braille, text and sonification modes, and opening the help and chat menus.',
  'Live & Streaming Data': 'How to update MAIDR charts in realtime: setData, appendData streaming, sliding windows, and monitor mode for auto-sonifying live data.',
  'Tactile Graphics Display': 'How MAIDR renders charts on the Dot Pad X tactile graphics display over Bluetooth or USB, with the keyboard controls and setup steps the tactile mode needs.',
  'Violin Plot Specification': 'Technical specification for MAIDR violin plots: the KDE and box layer data structures, how each layer is navigated and sonified, and a backend checklist.',
};

const today = new Date().toISOString().split('T')[0];

/** Date of the last commit touching `relPath`, or today outside a git checkout. */
function lastCommitDate(relPath) {
  return lastCommit(ROOT, relPath, today);
}

/** Date of the commit that added `relPath`, followed across renames. */
function firstCommitDate(relPath) {
  return firstCommit(ROOT, relPath, today);
}

/**
 * Build a BreadcrumbList JSON-LD block for the given page.
 */
function buildBreadcrumbSchema(title, canonicalUrl) {
  const crumbs = [{ name: 'Home', url: SITE_URL }];
  if (canonicalUrl !== SITE_URL) {
    crumbs.push({ name: title, url: canonicalUrl });
  }
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': crumbs.map((c, i) => ({
      '@type': 'ListItem',
      'position': i + 1,
      'name': c.name,
      'item': c.url,
    })),
  }, null, 2);
}

/**
 * The visible breadcrumb trail the BreadcrumbList above describes. Google
 * asks that structured data mirror what the page shows, so the markup and
 * the trail come from the same two crumbs.
 */
function buildBreadcrumbNav(title, dateModified = '') {
  // The TechArticle's dateModified needs a visible counterpart; the date is
  // the last commit touching the page's source, the same one the sitemap uses.
  const pageMeta = dateModified
    ? `\n  <p class="page-meta">Last updated <time datetime="${dateModified}">${dateModified}</time></p>`
    : '';
  return `<nav class="breadcrumb" aria-label="Breadcrumb">
    <ol>
      <li><a href="{{BASE_PATH}}index.html">Home</a></li>
      <li aria-current="page">${title}</li>
    </ol>
  </nav>${pageMeta}`;
}

/**
 * Build a TechArticle JSON-LD block for documentation pages.
 */
function buildTechArticleSchema(title, description, canonicalUrl, datePublished, dateModified) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    'headline': title,
    'description': description,
    'url': canonicalUrl,
    'datePublished': datePublished,
    'dateModified': dateModified,
    'author': { '@id': 'https://maidr.ai/#organization' },
    'publisher': { '@id': 'https://maidr.ai/#organization' },
    'isPartOf': { '@id': 'https://maidr.ai/#website' },
    'about': { '@id': 'https://maidr.ai/#software' },
  }, null, 2);
}

/**
 * The papers the README's "Papers" section lists, as ScholarlyArticle nodes
 * keyed by DOI. Emitted on the home page only, where the citations are
 * visible; the software node there references them via `citation`.
 */
const PAPERS = [
  {
    '@type': 'ScholarlyArticle',
    '@id': 'https://doi.org/10.1145/3613904.3642730',
    'name': 'MAIDR: Making Statistical Visualizations Accessible with Multimodal Data Representation',
    'author': [
      { '@id': 'https://maidr.ai/#jooyoung-seo' },
      { '@type': 'Person', 'name': 'Yilin Xia' },
      { '@type': 'Person', 'name': 'Bongshin Lee' },
      { '@type': 'Person', 'name': 'Sean Mccurry' },
      { '@type': 'Person', 'name': 'Yu Jun Yam' },
    ],
    'datePublished': '2024-05',
    'isPartOf': {
      '@type': 'Book',
      'name': 'Proceedings of the CHI Conference on Human Factors in Computing Systems (CHI \'24)',
      'isbn': '9798400703300',
    },
    'publisher': { '@type': 'Organization', 'name': 'Association for Computing Machinery' },
    'identifier': '10.1145/3613904.3642730',
    'url': 'https://doi.org/10.1145/3613904.3642730',
  },
  {
    '@type': 'ScholarlyArticle',
    '@id': 'https://doi.org/10.2312/eved.20241053',
    'name': 'Designing Born-Accessible Courses in Data Science and Visualization: Challenges and Opportunities of a Remote Curriculum Taught by Blind Instructors to Blind Students',
    'author': [
      { '@id': 'https://maidr.ai/#jooyoung-seo' },
      { '@type': 'Person', 'name': 'Sile O\'Modhrain' },
      { '@type': 'Person', 'name': 'Yilin Xia' },
      { '@type': 'Person', 'name': 'Sanchita Kamath' },
      { '@type': 'Person', 'name': 'Bongshin Lee' },
      { '@type': 'Person', 'name': 'James M. Coughlan' },
    ],
    'datePublished': '2024',
    'isPartOf': {
      '@type': 'Book',
      'name': 'EuroVis 2024 - Education Papers',
      'isbn': '978-3-03868-257-8',
    },
    'publisher': { '@type': 'Organization', 'name': 'The Eurographics Association' },
    'identifier': '10.2312/eved.20241053',
    'url': 'https://doi.org/10.2312/eved.20241053',
  },
];

/** The home page's own node, cross-linking the Python and R sites. */
const HOME_WEBPAGE = {
  '@type': 'WebPage',
  '@id': 'https://maidr.ai/#webpage',
  'url': SITE_URL,
  'isPartOf': { '@id': 'https://maidr.ai/#website' },
  'mainEntity': { '@id': 'https://maidr.ai/#software' },
  'relatedLink': ['https://py.maidr.ai/', 'https://r.maidr.ai/'],
};

/** Indent every line but the first so a node sits inside the template's @graph. */
function graphNode(node) {
  return JSON.stringify(node, null, 2).replace(/\n/g, '\n      ');
}

/**
 * Generate a page from template.
 * @param {object} opts
 * @param {string} opts.title            - nav-facing title; also the breadcrumb text
 * @param {string} opts.content          - inner HTML
 * @param {string} opts.activePage       - 'home' | 'react' | 'examples' | 'api' | ''
 * @param {string} [opts.basePath]
 * @param {string} [opts.slug]           - path portion after domain (e.g. 'react.html')
 * @param {string} [opts.ogType]
 * @param {string} [opts.pageSchema]     - extra JSON-LD script tags
 * @param {string} [opts.seoTitle]       - full <title>; defaults to "<title> - MAIDR"
 * @param {string} [opts.dateModified]   - ISO date shown as "Last updated" under the breadcrumb
 */
function generatePage({ title, content, activePage, basePath = '', slug = '', ogType = 'website', pageSchema = '', seoTitle = `${title} - MAIDR`, dateModified = '' }) {
  const description = PAGE_DESCRIPTIONS[activePage] || PAGE_DESCRIPTIONS[title];
  if (!description) {
    throw new Error(`[SEO] No description for page "${title}" (activePage: "${activePage}"). Add one to PAGE_DESCRIPTIONS in scripts/build-site.js.`);
  }
  if (description.length < 70 || description.length > 160) {
    console.warn(`[SEO] Description for "${title}" is ${description.length} characters; aim for 70-160.`);
  }
  const canonicalUrl = slug ? `${SITE_URL}${slug}` : SITE_URL;
  const isHome = canonicalUrl === SITE_URL;

  // Breadcrumbs are for pages below the home page: a single-item list is unusual.
  const breadcrumbTag = isHome
    ? ''
    : `<script type="application/ld+json">\n  ${buildBreadcrumbSchema(title, canonicalUrl)}\n  </script>`;
  const allPageSchemas = [breadcrumbTag, pageSchema].filter(Boolean).join('\n  ');

  // The papers and the WebPage node are visible on the home page only.
  const softwareCitation = isHome
    ? `"citation": ${graphNode(PAPERS.map(paper => ({ '@id': paper['@id'] })))},\n        `
    : '';
  const homeGraphNodes = isHome
    ? [HOME_WEBPAGE, ...PAPERS].map(node => `,\n      ${graphNode(node)}`).join('')
    : '';

  const page = template
    .replace(/\{\{TITLE\}\}/g, () => title)
    .replace(/\{\{SEO_TITLE\}\}/g, () => seoTitle)
    .replace(/\{\{DESCRIPTION\}\}/g, () => description)
    .replace(/\{\{CANONICAL_URL\}\}/g, () => canonicalUrl)
    .replace(/\{\{SOFTWARE_VERSION\}\}/g, () => PKG.version)
    .replace(/\{\{SOFTWARE_CITATION\}\}/g, () => softwareCitation)
    .replace(/\{\{HOME_GRAPH_NODES\}\}/g, () => homeGraphNodes)
    .replace(/\{\{OG_TYPE\}\}/g, () => ogType)
    .replace(/\{\{PAGE_SCHEMA\}\}/g, () => allPageSchemas)
    .replace(/\{\{BREADCRUMB\}\}/g, () => isHome ? '' : buildBreadcrumbNav(title, dateModified))
    .replace(/\{\{CONTENT\}\}/g, () => content)
    .replace(/\{\{HOME_ACTIVE\}\}/g, () => activePage === 'home' ? 'active' : '')
    .replace(/\{\{REACT_ACTIVE\}\}/g, () => activePage === 'react' ? 'active' : '')
    .replace(/\{\{RECHARTS_ACTIVE\}\}/g, () => activePage === 'recharts' ? 'active' : '')
    .replace(/\{\{PLOTLY_ACTIVE\}\}/g, () => activePage === 'plotly' ? 'active' : '')
    .replace(/\{\{GOOGLE_CHARTS_ACTIVE\}\}/g, () => activePage === 'google-charts' ? 'active' : '')
    .replace(/\{\{D3_ACTIVE\}\}/g, () => activePage === 'd3' ? 'active' : '')
    .replace(/\{\{VEGALITE_ACTIVE\}\}/g, () => activePage === 'vegalite' ? 'active' : '')
    .replace(/\{\{CHARTJS_ACTIVE\}\}/g, () => activePage === 'chartjs' ? 'active' : '')
    .replace(/\{\{AMCHARTS_ACTIVE\}\}/g, () => activePage === 'amcharts' ? 'active' : '')
    .replace(/\{\{ECHARTS_ACTIVE\}\}/g, () => activePage === 'echarts' ? 'active' : '')
    .replace(/\{\{FRAPPE_ACTIVE\}\}/g, () => activePage === 'frappe' ? 'active' : '')
    .replace(/\{\{OBSERVABLE_ACTIVE\}\}/g, () => activePage === 'observable' ? 'active' : '')
    .replace(/\{\{VICTORY_ACTIVE\}\}/g, () => activePage === 'victory' ? 'active' : '')
    .replace(/\{\{ANYCHART_ACTIVE\}\}/g, () => activePage === 'anychart' ? 'active' : '')
    .replace(/\{\{HIGHCHARTS_ACTIVE\}\}/g, () => activePage === 'highcharts' ? 'active' : '')
    .replace(/\{\{TABLEAU_ACTIVE\}\}/g, () => activePage === 'tableau' ? 'active' : '')
    .replace(/\{\{EXAMPLES_ACTIVE\}\}/g, () => activePage === 'examples' ? 'active' : '')
    .replace(/\{\{API_ACTIVE\}\}/g, () => activePage === 'api' ? 'active' : '')
    .replace(/\{\{BASE_PATH\}\}/g, () => basePath);

  return page;
}

// Build index.html from README
console.log('Building index.html from README.md...');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf-8');
let readmeContentHtml = markdownToHtml(readme);
// Rewrite docs/*.md links to docs/*.html for the built site
readmeContentHtml = readmeContentHtml.replace(/href="docs\/([^"]+)\.[mM][dD]"/g, 'href="docs/$1.html"');
// React docs are built at root level, not in docs/ subdirectory
readmeContentHtml = readmeContentHtml.replace(/href="docs\/react\.html"/g, 'href="react.html"');
const readmeHtml = `
<div class="hero">
  <img src="media/logo.svg" alt="MAIDR Logo" />
</div>
<div class="content">
  ${readmeContentHtml}
</div>
`;
const indexPage = generatePage({
  title: 'Home',
  seoTitle: 'MAIDR: Accessible Data Visualization with Sonification, Braille and Text',
  content: readmeHtml,
  activePage: 'home',
  slug: '',
});
fs.writeFileSync(path.join(SITE_DIR, 'index.html'), indexPage);

// Build one root page per integration guide
const builtIntegrations = [];
for (const { slug, title, source } of INTEGRATION_PAGES) {
  const mdPath = path.join(ROOT, 'docs', source);
  if (!fs.existsSync(mdPath)) {
    console.warn(`Warning: docs/${source} not found; skipping ${slug}.html`);
    continue;
  }
  console.log(`Building ${slug}.html from docs/${source}...`);
  const md = fs.readFileSync(mdPath, 'utf-8');
  const html = `
<div class="content">
  ${renderMarkdown(md)}
</div>
`;
  const description = PAGE_DESCRIPTIONS[slug];
  if (!description) {
    throw new Error(`[SEO] No description for integration page "${slug}" (docs/${source}). Add one to PAGE_DESCRIPTIONS in scripts/build-site.js.`);
  }
  const relSource = `docs/${source}`;
  const dateModified = lastCommitDate(relSource);
  const canonical = `${SITE_URL}${slug}.html`;
  const techArticleTag = `<script type="application/ld+json">\n  ${buildTechArticleSchema(title, description, canonical, firstCommitDate(relSource), dateModified)}\n  </script>`;
  const page = generatePage({
    title,
    seoTitle: `${title} Accessibility Integration - MAIDR`,
    content: html,
    activePage: slug,
    slug: `${slug}.html`,
    ogType: 'article',
    pageSchema: techArticleTag,
    dateModified,
  });
  fs.writeFileSync(path.join(SITE_DIR, `${slug}.html`), page);
  builtIntegrations.push({ slug, source });
}

// Build examples.html (inline gallery content — no middle iframe)
//
// The gallery is read off `examples/` rather than listed here. The list that
// used to live in this file named 88 of the 199 pages in that directory, and
// nothing failed when the two drifted apart, so the other 111 shipped with the
// site and were reachable from nothing on it. See scripts/examplesGallery.js.
console.log('Building examples.html...');
const { sections, unclaimed } = buildGallery(listExamplePages(path.join(ROOT, 'examples')));
for (const page of unclaimed) {
  console.warn(`Warning: examples/${page} is in no gallery group. Add a group for its directory in scripts/examplesGallery.js.`);
}
const gallery = renderGallery(sections);
console.log(`  ${sections.reduce((n, section) => n + section.items.length, 0)} gallery entries in ${sections.length} groups`);

const examplesContent = `
<style>
  .examples-gallery { padding: 20px; }
  .examples-gallery ul a { display: block; margin: 8px 0; font-size: 18px; cursor: pointer; }
  .examples-gallery #content { margin-top: 40px; padding: 20px; border: 1px solid #ccc; }
</style>
<div class="examples-gallery">
  <h1>MAIDR Examples</h1>
  <h2>Click on one of the examples below to see a demonstration</h2>

${gallery}

  <div id="content" hidden="true">Select an example above.</div>
</div>

<script>
  function loadReact() {
    var heading = document.createElement('h2');
    heading.id = 'example-heading';
    heading.textContent = 'React Examples';
    heading.tabIndex = -1;
    heading.style.marginTop = '0';

    var iframe = document.createElement('iframe');
    iframe.src = 'examples/react/index.html';
    iframe.style.width = '100%';
    iframe.style.height = '800px';
    iframe.style.border = 'none';
    iframe.tabIndex = 0;
    iframe.title = 'React Examples';
    iframe.setAttribute('aria-label', 'React example demonstration');

    var contentDiv = document.getElementById('content');
    contentDiv.innerHTML = '';
    contentDiv.appendChild(heading);
    contentDiv.appendChild(iframe);
    contentDiv.hidden = false;

    setTimeout(function() { heading.focus(); }, 100);
  }

  function loadRecharts() {
    var heading = document.createElement('h2');
    heading.id = 'example-heading';
    heading.textContent = 'Recharts Examples';
    heading.tabIndex = -1;
    heading.style.marginTop = '0';

    var iframe = document.createElement('iframe');
    iframe.src = 'examples/recharts/index.html';
    iframe.style.width = '100%';
    iframe.style.height = '800px';
    iframe.style.border = 'none';
    iframe.tabIndex = 0;
    iframe.title = 'Recharts Examples';
    iframe.setAttribute('aria-label', 'Recharts example demonstration');

    var contentDiv = document.getElementById('content');
    contentDiv.innerHTML = '';
    contentDiv.appendChild(heading);
    contentDiv.appendChild(iframe);
    contentDiv.hidden = false;

    setTimeout(function() { heading.focus(); }, 100);
  }

  function loadVictory() {
    var heading = document.createElement('h2');
    heading.id = 'example-heading';
    heading.textContent = 'Victory Examples';
    heading.tabIndex = -1;
    heading.style.marginTop = '0';

    var iframe = document.createElement('iframe');
    iframe.src = 'examples/victory/index.html';
    iframe.style.width = '100%';
    iframe.style.height = '800px';
    iframe.style.border = 'none';
    iframe.tabIndex = 0;
    iframe.title = 'Victory Examples';
    iframe.setAttribute('aria-label', 'Victory example demonstration');

    var contentDiv = document.getElementById('content');
    contentDiv.innerHTML = '';
    contentDiv.appendChild(heading);
    contentDiv.appendChild(iframe);
    contentDiv.hidden = false;

    setTimeout(function() { heading.focus(); }, 100);
  }

  function loadHTML(filename, headingText) {
    try {
      var heading = document.createElement('h2');
      heading.id = 'example-heading';
      heading.textContent = headingText;
      heading.tabIndex = -1;
      heading.style.marginTop = '0';

      var iframe = document.createElement('iframe');
      iframe.src = 'examples/' + filename;
      iframe.style.width = '100%';
      iframe.style.height = '800px';
      iframe.style.border = 'none';
      iframe.tabIndex = 0;
      iframe.title = headingText + ' example';
      iframe.setAttribute('aria-label', headingText + ' example demonstration');

      var contentDiv = document.getElementById('content');
      contentDiv.innerHTML = '';
      contentDiv.appendChild(heading);
      contentDiv.appendChild(iframe);
      contentDiv.hidden = false;

      setTimeout(function() { heading.focus(); }, 100);
    } catch (err) {
      console.error(err);
      document.getElementById('content').innerText = 'Failed to load: ' + err.message;
    }
  }
</script>
`;
const examplesPage = generatePage({ title: 'Examples', content: examplesContent, activePage: 'examples', slug: 'examples.html' });
fs.writeFileSync(path.join(SITE_DIR, 'examples.html'), examplesPage);

// Copy media folder
console.log('Copying media folder...');
const mediaSource = path.join(ROOT, 'media');
const mediaDest = path.join(SITE_DIR, 'media');
if (fs.existsSync(mediaSource)) {
  fs.cpSync(mediaSource, mediaDest, { recursive: true });
}

// Copy dist folder
console.log('Copying dist folder...');
const distSource = path.join(ROOT, 'dist');
const distDest = path.join(SITE_DIR, 'dist');
if (fs.existsSync(distSource)) {
  fs.cpSync(distSource, distDest, { recursive: true });
}

// Build React example
console.log('Building React example...');
execSync('npm run build:react-example', { stdio: 'inherit', cwd: ROOT });

// Copy examples folder
console.log('Copying examples folder...');
const examplesSource = path.join(ROOT, 'examples');
const examplesDest = path.join(SITE_DIR, 'examples');
if (fs.existsSync(examplesSource)) {
  fs.cpSync(examplesSource, examplesDest, { recursive: true });
}

// Copy built Recharts example (single-file HTML) to _site/examples/recharts/
console.log('Copying built Recharts example...');
const rechartsBuilt = path.join(ROOT, 'examples', 'recharts', 'dist', 'index.html');
const rechartsSiteDest = path.join(SITE_DIR, 'examples', 'recharts');
if (fs.existsSync(rechartsBuilt)) {
  if (!fs.existsSync(rechartsSiteDest)) {
    fs.mkdirSync(rechartsSiteDest, { recursive: true });
  }
  fs.copyFileSync(rechartsBuilt, path.join(rechartsSiteDest, 'index.html'));
} else {
  console.warn('Warning: Built Recharts example not found. Run "npm run build:recharts-example" first.');
}

// Copy built Victory example (single-file HTML) to _site/examples/victory/
console.log('Copying built Victory example...');
const victoryBuilt = path.join(ROOT, 'examples', 'victory', 'dist', 'index.html');
const victorySiteDest = path.join(SITE_DIR, 'examples', 'victory');
if (fs.existsSync(victoryBuilt)) {
  if (!fs.existsSync(victorySiteDest)) {
    fs.mkdirSync(victorySiteDest, { recursive: true });
  }
  fs.copyFileSync(victoryBuilt, path.join(victorySiteDest, 'index.html'));
} else {
  console.warn('Warning: Built Victory example not found. Run "npm run build:victory-example" first.');
}

/**
 * Keep the example pages out of the search index.
 *
 * They are demo files: no title worth indexing, no description, often no
 * heading, and the Recharts bundle sits at Googlebot's 2 MB cut-off. The
 * gallery on examples.html links them with real hrefs so they are crawlable
 * (and so the links work for assistive technology), and this tag keeps that
 * from filling the index with 250-odd thin pages. examples.html itself is
 * not touched; it has unique text and stays indexable.
 */
function noindexExamplePages(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += noindexExamplePages(full);
      continue;
    }
    if (!entry.name.endsWith('.html')) {
      continue;
    }
    const html = fs.readFileSync(full, 'utf-8');
    if (/<meta\s+name="robots"/i.test(html)) {
      continue;
    }
    const tag = '<meta name="robots" content="noindex">';
    const tagged = /<head[^>]*>/i.test(html)
      ? html.replace(/<head[^>]*>/i, match => `${match}\n${tag}`)
      : `${tag}\n${html}`;
    fs.writeFileSync(full, tagged);
    count += 1;
  }
  return count;
}
if (fs.existsSync(examplesDest)) {
  console.log(`Marked ${noindexExamplePages(examplesDest)} example pages noindex`);
}

// Process docs folder: convert .md to HTML pages, copy other static assets
const docsSource = path.join(ROOT, 'docs');
const docsSiteDest = path.join(SITE_DIR, 'docs');
const builtDocs = [];
if (fs.existsSync(docsSource)) {
  const files = fs.readdirSync(docsSource);
  for (const file of files) {
    if (file === 'template.html' || file === 'examples' || INTEGRATION_SOURCES.has(file))
      continue;

    const src = path.join(docsSource, file);
    const ext = path.extname(file).toLowerCase();

    if (ext === '.md') {
      // Convert markdown files to HTML pages in _site/docs/
      console.log(`Building docs/${file}...`);
      if (!fs.existsSync(docsSiteDest)) {
        fs.mkdirSync(docsSiteDest, { recursive: true });
      }
      const md = fs.readFileSync(src, 'utf-8');
      const htmlContent = `<div class="content">${markdownToHtml(md)}</div>`;
      const baseName = path.basename(file, path.extname(file));
      const title = DOC_TITLES[baseName] ?? baseName;
      const docSlug = `docs/${baseName}.html`;
      const docCanonical = `${SITE_URL}${docSlug}`;
      const relSource = `docs/${file}`;
      const dateModified = lastCommitDate(relSource);
      const datePublished = firstCommitDate(relSource);
      const description = PAGE_DESCRIPTIONS[title];
      if (!description) {
        throw new Error(`[SEO] No description for docs page "${title}" (docs/${file}). Add one to PAGE_DESCRIPTIONS in scripts/build-site.js.`);
      }
      const techArticleTag = `<script type="application/ld+json">\n  ${buildTechArticleSchema(title, description, docCanonical, datePublished, dateModified)}\n  </script>`;
      const docPage = generatePage({
        title,
        content: htmlContent,
        activePage: '',
        basePath: '../',
        slug: docSlug,
        ogType: 'article',
        pageSchema: techArticleTag,
        dateModified,
      });
      fs.writeFileSync(path.join(docsSiteDest, `${baseName}.html`), docPage);
      builtDocs.push({ slug: docSlug, lastmod: dateModified });
    } else if (fs.statSync(src).isDirectory()) {
      // Copy directories to _site/ root
      fs.cpSync(src, path.join(SITE_DIR, file), { recursive: true });
    } else {
      // Copy other static files to _site/ root
      fs.copyFileSync(src, path.join(SITE_DIR, file));
    }
  }
}

// Generate sitemap.xml from the pages built above, so a new page cannot be
// left out of it. Only <loc> and <lastmod>: Google ignores <changefreq> and
// <priority>. The API reference has its own sitemap, written by TypeDoc from
// `hostedBaseUrl` to _site/api/sitemap.xml and listed in docs/robots.txt.
console.log('Generating sitemap.xml...');

const sitemapUrls = [
  { loc: SITE_URL, lastmod: lastCommitDate('README.md') },
  ...builtIntegrations.map(({ slug, source }) => ({
    loc: `${SITE_URL}${slug}.html`,
    lastmod: lastCommitDate(`docs/${source}`),
  })),
  { loc: `${SITE_URL}examples.html`, lastmod: lastCommitDate('examples') },
  ...builtDocs.map(({ slug, lastmod }) => ({ loc: `${SITE_URL}${slug}`, lastmod })),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(SITE_DIR, 'sitemap.xml'), sitemap);

console.log('Site built successfully!');
console.log('Run "npx typedoc" to generate API documentation in _site/api/');
