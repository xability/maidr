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
function generatePage(title, content, activePage) {
  const page = template
    .replace('{{TITLE}}', title)
    .replace('{{CONTENT}}', content)
    .replace('{{HOME_ACTIVE}}', activePage === 'home' ? 'active' : '')
    .replace('{{REACT_ACTIVE}}', activePage === 'react' ? 'active' : '')
    .replace('{{EXAMPLES_ACTIVE}}', activePage === 'examples' ? 'active' : '')
    .replace('{{API_ACTIVE}}', activePage === 'api' ? 'active' : '');

  return page;
}

// Build index.html from README
console.log('Building index.html from README.md...');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf-8');
const readmeHtml = `
<div class="hero">
  <img src="media/logo.svg" alt="MAIDR Logo" />
</div>
<div class="content">
  ${markdownToHtml(readme)}
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

// Copy docs folder static assets (excluding template.html and examples/)
// Note: examples/ is already copied from root, so we skip docs/examples/ to avoid overwriting
const docsSource = path.join(ROOT, 'docs');
if (fs.existsSync(docsSource)) {
  const files = fs.readdirSync(docsSource);
  for (const file of files) {
    if (file !== 'template.html' && file !== 'examples') {
      const src = path.join(docsSource, file);
      const dest = path.join(SITE_DIR, file);
      if (fs.statSync(src).isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
      } else {
        fs.copyFileSync(src, dest);
      }
    }
  }
}

console.log('Site built successfully!');
console.log('Run "npx typedoc" to generate API documentation in _site/api/');
