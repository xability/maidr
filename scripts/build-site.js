#!/usr/bin/env node

/**
 * Build script to generate the documentation site
 * - Creates index.html from README.md
 * - Creates examples.html that embeds the examples
 * - Copies media and examples folders
 * - TypeDoc generates API docs separately
 */

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

// Build examples.html
console.log('Building examples.html...');
const examplesContent = `
<iframe src="examples/example-gallery.html" class="examples-frame" title="MAIDR Examples"></iframe>
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
    if (file === 'template.html' || file === 'examples')
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
      const htmlContent = `<div class="content">${marked.parse(md)}</div>`;
      const baseName = path.basename(file, path.extname(file));
      const title = baseName.charAt(0).toUpperCase() + baseName.slice(1);
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
