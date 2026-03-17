#!/usr/bin/env node

/**
 * Build script to generate the documentation site
 * - Creates index.html from README.md
 * - Creates examples.html that embeds the examples
 * - Copies media and examples folders
 * - TypeDoc generates API docs separately
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { marked } = require('marked');

const ROOT = path.join(__dirname, '..');
const SITE_DIR = path.join(ROOT, '_site');
const TEMPLATE_PATH = path.join(ROOT, 'docs', 'template.html');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

// Ensure _site directory exists
if (!fs.existsSync(SITE_DIR)) {
  fs.mkdirSync(SITE_DIR, { recursive: true });
}

// Read template
const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

// Configure marked for safe HTML output
marked.setOptions({
  gfm: true,
  breaks: false,
});

/**
 * Convert markdown to HTML using marked library
 */
function markdownToHtml(md) {
  // Remove the centered logo div at the top of README
  const content = md.replace(/<div align="center">[\s\S]*?<\/div>\s*/, '');

  // Convert markdown to HTML
  return marked.parse(content);
}

// Per-page SEO descriptions
const PAGE_DESCRIPTIONS = {
  'home': 'MAIDR provides accessible, non-visual access to statistical charts through audio sonification, text descriptions, braille output, and AI-powered descriptions.',
  'react': 'How to integrate MAIDR accessible data visualizations into React applications with TypeScript support.',
  'examples': 'Interactive examples of accessible bar plots, line charts, heatmaps, scatter plots, box plots, and more using MAIDR.',
  'api': 'TypeDoc API reference for the MAIDR TypeScript library.',
  'Data Schema': 'MAIDR data schema specification for defining accessible chart data structures.',
  'Braille Generation': 'Documentation for MAIDR braille output generation for tactile data exploration.',
  'Keyboard Controls': 'Keyboard controls reference for navigating MAIDR accessible data visualizations.',
  'Violin Plot Specification': 'Technical specification for MAIDR violin plot data structures and rendering.',
};

/**
 * Build a BreadcrumbList JSON-LD block for the given page.
 */
function buildBreadcrumbSchema(title, canonicalUrl) {
  const crumbs = [{ name: 'Home', url: 'https://maidr.ai/' }];
  if (canonicalUrl !== 'https://maidr.ai/') {
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
 * Build a TechArticle JSON-LD block for documentation pages.
 */
function buildTechArticleSchema(title, description, canonicalUrl, dateModified) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    'headline': title,
    'description': description,
    'url': canonicalUrl,
    'datePublished': '2024-01-15',
    'dateModified': dateModified,
    'publisher': { '@id': 'https://maidr.ai/#organization' },
    'isPartOf': { '@id': 'https://maidr.ai/#website' },
    'about': { '@id': 'https://maidr.ai/#software' },
  }, null, 2);
}

/**
 * Generate a page from template.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.content       - inner HTML
 * @param {string} opts.activePage     - 'home' | 'react' | 'examples' | 'api' | ''
 * @param {string} [opts.basePath]
 * @param {string} [opts.slug]         - path portion after domain (e.g. 'react.html')
 * @param {string} [opts.ogType]
 * @param {string} [opts.pageSchema]   - extra JSON-LD script tags
 */
function generatePage({ title, content, activePage, basePath = '', slug = '', ogType = 'website', pageSchema = '' }) {
  const description = PAGE_DESCRIPTIONS[activePage] || PAGE_DESCRIPTIONS[title];
  if (!description) {
    console.warn(`[SEO] No description for page "${title}" (activePage: "${activePage}") — falling back to homepage description`);
  }
  const finalDescription = description || PAGE_DESCRIPTIONS.home;
  const canonicalUrl = slug ? `https://maidr.ai/${slug}` : 'https://maidr.ai/';

  // Always generate breadcrumb schema
  const breadcrumbTag = `<script type="application/ld+json">\n  ${buildBreadcrumbSchema(title, canonicalUrl)}\n  </script>`;
  const allPageSchemas = [breadcrumbTag, pageSchema].filter(Boolean).join('\n  ');

  const page = template
    .replace(/\{\{TITLE\}\}/g, title)
    .replace(/\{\{DESCRIPTION\}\}/g, finalDescription)
    .replace(/\{\{CANONICAL_URL\}\}/g, canonicalUrl)
    .replace(/\{\{SOFTWARE_VERSION\}\}/g, PKG.version)
    .replace(/\{\{OG_TYPE\}\}/g, ogType)
    .replace(/\{\{PAGE_SCHEMA\}\}/g, () => allPageSchemas)
    .replace(/\{\{CONTENT\}\}/g, () => content)
    .replace(/\{\{HOME_ACTIVE\}\}/g, activePage === 'home' ? 'active' : '')
    .replace(/\{\{REACT_ACTIVE\}\}/g, activePage === 'react' ? 'active' : '')
    .replace(/\{\{EXAMPLES_ACTIVE\}\}/g, activePage === 'examples' ? 'active' : '')
    .replace(/\{\{API_ACTIVE\}\}/g, activePage === 'api' ? 'active' : '')
    .replace(/\{\{BASE_PATH\}\}/g, basePath);

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
const indexPage = generatePage({ title: 'Home', content: readmeHtml, activePage: 'home', slug: '' });
fs.writeFileSync(path.join(SITE_DIR, 'index.html'), indexPage);

// Build react.html from docs/react.md
console.log('Building react.html from docs/react.md...');
const reactMdPath = path.join(ROOT, 'docs', 'react.md');
if (fs.existsSync(reactMdPath)) {
  const reactMd = fs.readFileSync(reactMdPath, 'utf-8');
  const reactHtml = `
<div class="content">
  ${marked.parse(reactMd)}
</div>
`;
  const reactPage = generatePage({ title: 'React', content: reactHtml, activePage: 'react', slug: 'react.html', ogType: 'article' });
  fs.writeFileSync(path.join(SITE_DIR, 'react.html'), reactPage);
}

// Build examples.html (inline gallery content — no middle iframe)
console.log('Building examples.html...');
const examplesContent = `
<style>
  .examples-gallery { padding: 20px; }
  .examples-gallery ul a { display: block; margin: 8px 0; font-size: 18px; cursor: pointer; }
  .examples-gallery #content { margin-top: 40px; padding: 20px; border: 1px solid #ccc; }
</style>
<div class="examples-gallery">
  <h1>MAIDR Examples</h1>
  <h2>Click on one of the examples below to see a demonstration</h2>

  <h3>React</h3>
  <ul>
    <li><a href="#" onclick="loadReact(); return false;">React Examples (Bar, Line, Smooth)</a></li>
  </ul>
  <p>See the <a href="react.html">React Integration Guide</a> for setup instructions, TypeScript types, and code examples for all plot types.</p>

  <h3>HTML / Vanilla JS</h3>
  <ul>
    <li><a href="#" onclick="loadHTML('barplot.html', 'Barplot'); return false;">Barplot</a></li>
    <li><a href="#" onclick="loadHTML('candlestick_multilayer.html', 'Candlestick multilayer'); return false;">Candlestick multilayer</a></li>
    <li><a href="#" onclick="loadHTML('dodged_barplot.html', 'Dodged Barplot'); return false;">Dodged Barplot</a></li>
    <li><a href="#" onclick="loadHTML('facet_barplot.html', 'Faceted Bar plots'); return false;">Faceted Bar plots</a></li>
    <li><a href="#" onclick="loadHTML('heatmap.html', 'Heatmap'); return false;">Heatmap</a></li>
    <li><a href="#" onclick="loadHTML('histogram.html', 'Histogram'); return false;">Histogram</a></li>
    <li><a href="#" onclick="loadHTML('horizontal-boxplot.html', 'Horizontal box plot'); return false;">Horizontal box plot</a></li>
    <li><a href="#" onclick="loadHTML('lineplot.html', 'Single Line plot'); return false;">Single Line plot</a></li>
    <li><a href="#" onclick="loadHTML('multiline_plot.html', 'Multi line plot'); return false;">Multi line plot</a></li>
    <li><a href="#" onclick="loadHTML('multilayer_plot.html', 'Multi layered plot'); return false;">Multi layered plot</a></li>
    <li><a href="#" onclick="loadHTML('multipanel.html', 'Multi panel plot'); return false;">Multi panel plot</a></li>
    <li><a href="#" onclick="loadHTML('scatter_plot.html', 'Scatter plot'); return false;">Scatter plot</a></li>
    <li><a href="#" onclick="loadHTML('smooth_plot.html', 'Smooth plot'); return false;">Smooth plot</a></li>
    <li><a href="#" onclick="loadHTML('stacked_bar.html', 'Stacked Bar plot'); return false;">Stacked Bar plot</a></li>
    <li><a href="#" onclick="loadHTML('vertical-boxplot.html', 'Vertical box plot'); return false;">Vertical box plot</a></li>
    <li><a href="#" onclick="loadHTML('vertical-candlestick.html', 'Vertical candle stick plot'); return false;">Vertical candle stick plot</a></li>
    <li><a href="#" onclick="loadHTML('violin.html', 'Violin plot'); return false;">Violin plot</a></li>
  </ul>

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

const today = new Date().toISOString().split('T')[0];

/** Return file mtime as YYYY-MM-DD, or today if the file does not exist. */
function fileMod(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString().split('T')[0];
  } catch {
    return today;
  }
}

// Process docs folder: convert .md to HTML pages, copy other static assets
const docsSource = path.join(ROOT, 'docs');
const docsSiteDest = path.join(SITE_DIR, 'docs');
if (fs.existsSync(docsSource)) {
  const files = fs.readdirSync(docsSource);
  for (const file of files) {
    if (file === 'template.html' || file === 'examples' || file === 'react.md')
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
      const titleMap = {
        SCHEMA: 'Data Schema',
        BRAILLE: 'Braille Generation',
        CONTROLS: 'Keyboard Controls',
        VIOLIN_PLOT_SPEC: 'Violin Plot Specification',
      };
      const title = titleMap[baseName] ?? baseName;
      const docSlug = `docs/${baseName}.html`;
      const docCanonical = `https://maidr.ai/${docSlug}`;
      const fileMtime = fileMod(src);
      const description = PAGE_DESCRIPTIONS[title] || PAGE_DESCRIPTIONS.home;
      const techArticleTag = `<script type="application/ld+json">\n  ${buildTechArticleSchema(title, description, docCanonical, fileMtime)}\n  </script>`;
      const docPage = generatePage({
        title,
        content: htmlContent,
        activePage: '',
        basePath: '../',
        slug: docSlug,
        ogType: 'article',
        pageSchema: techArticleTag,
      });
      fs.writeFileSync(path.join(docsSiteDest, `${baseName}.html`), docPage);
    } else if (fs.statSync(src).isDirectory()) {
      // Copy directories to _site/ root
      fs.cpSync(src, path.join(SITE_DIR, file), { recursive: true });
    } else {
      // Copy other static files to _site/ root
      fs.copyFileSync(src, path.join(SITE_DIR, file));
    }
  }
}

// Generate sitemap.xml
console.log('Generating sitemap.xml...');

const sitemapUrls = [
  { loc: 'https://maidr.ai/', priority: '1.0', lastmod: fileMod(path.join(ROOT, 'README.md')) },
  { loc: 'https://maidr.ai/react.html', priority: '0.8', lastmod: fileMod(path.join(ROOT, 'docs', 'react.md')) },
  { loc: 'https://maidr.ai/examples.html', priority: '0.8' },
  { loc: 'https://maidr.ai/api/index.html', priority: '0.7' },
  { loc: 'https://maidr.ai/docs/SCHEMA.html', priority: '0.6', lastmod: fileMod(path.join(ROOT, 'docs', 'SCHEMA.md')) },
  { loc: 'https://maidr.ai/docs/BRAILLE.html', priority: '0.6', lastmod: fileMod(path.join(ROOT, 'docs', 'BRAILLE.md')) },
  { loc: 'https://maidr.ai/docs/CONTROLS.html', priority: '0.6', lastmod: fileMod(path.join(ROOT, 'docs', 'CONTROLS.md')) },
  { loc: 'https://maidr.ai/docs/VIOLIN_PLOT_SPEC.html', priority: '0.6', lastmod: fileMod(path.join(ROOT, 'docs', 'VIOLIN_PLOT_SPEC.md')) },
];

// Dynamically add any other doc .md files that were built but not listed above
const knownDocSlugs = new Set(['SCHEMA', 'BRAILLE', 'CONTROLS', 'VIOLIN_PLOT_SPEC']);
if (fs.existsSync(docsSource)) {
  for (const f of fs.readdirSync(docsSource)) {
    if (f === 'template.html' || f === 'react.md' || !f.endsWith('.md'))
      continue;
    const base = path.basename(f, '.md');
    if (!knownDocSlugs.has(base)) {
      sitemapUrls.push({
        loc: `https://maidr.ai/docs/${base}.html`,
        priority: '0.5',
        lastmod: fileMod(path.join(docsSource, f)),
      });
    }
  }
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(u => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(SITE_DIR, 'sitemap.xml'), sitemap);

console.log('Site built successfully!');
console.log('Run "npx typedoc" to generate API documentation in _site/api/');
