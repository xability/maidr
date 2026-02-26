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

/**
 * Generate a page from template
 */
function generatePage(title, content, activePage, basePath = '') {
  const page = template
    .replace('{{TITLE}}', title)
    .replace('{{CONTENT}}', content)
    .replace('{{HOME_ACTIVE}}', activePage === 'home' ? 'active' : '')
    .replace('{{REACT_ACTIVE}}', activePage === 'react' ? 'active' : '')
    .replace('{{EXAMPLES_ACTIVE}}', activePage === 'examples' ? 'active' : '')
    .replace('{{API_ACTIVE}}', activePage === 'api' ? 'active' : '')
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
const indexPage = generatePage('Home', readmeHtml, 'home');
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
  const reactPage = generatePage('React', reactHtml, 'react');
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
const examplesPage = generatePage('Examples', examplesContent, 'examples');
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
      };
      const title = titleMap[baseName] ?? baseName;
      const docPage = generatePage(title, htmlContent, '', '../');
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

console.log('Site built successfully!');
console.log('Run "npx typedoc" to generate API documentation in _site/api/');
