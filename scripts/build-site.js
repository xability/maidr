#!/usr/bin/env node

/**
 * Build script to generate the documentation site
 * - Creates index.html from README.md
 * - Creates examples.html that embeds the examples
 * - Copies media and examples folders
 * - TypeDoc generates API docs separately
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE_DIR = path.join(ROOT, '_site');
const TEMPLATE_PATH = path.join(ROOT, 'docs', 'template.html');

// Ensure _site directory exists
if (!fs.existsSync(SITE_DIR)) {
  fs.mkdirSync(SITE_DIR, { recursive: true });
}

// Read template
const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

/**
 * Simple Markdown to HTML converter for basic formatting
 */
function markdownToHtml(md) {
  let html = md;

  // Remove the logo div at the top (it's centered div with img)
  html = html.replace(/<div align="center">[\s\S]*?<\/div>\s*/, '');

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre><code class="language-${lang || ''}">${escaped}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

  // Tables
  html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
    const cells = content.split('|').map(c => c.trim());
    return '<tr>' + cells.map(c => {
      if (c.match(/^[-:]+$/)) return null; // separator row
      return `<td>${c}</td>`;
    }).filter(Boolean).join('') + '</tr>';
  });

  // Wrap consecutive table rows
  html = html.replace(/(<tr>[\s\S]*?<\/tr>\n?)+/g, (match) => {
    // Convert first row to th
    const withHeader = match.replace(/<tr>([\s\S]*?)<\/tr>/, (m, content) => {
      return '<thead><tr>' + content.replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>') + '</tr></thead><tbody>';
    });
    return '<table>' + withHeader + '</tbody></table>';
  });

  // Remove separator rows that got through
  html = html.replace(/<tr><\/tr>/g, '');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Checkbox items
  html = html.replace(/- \[x\] (.+)/g, '<li><input type="checkbox" checked disabled> $1</li>');
  html = html.replace(/- \[ \] (.+)/g, '<li><input type="checkbox" disabled> $1</li>');

  // Paragraphs - wrap loose text
  const lines = html.split('\n');
  const result = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isBlockElement = /^<(h[1-6]|ul|ol|li|pre|table|thead|tbody|tr|td|th|div|blockquote|hr)/.test(trimmed);
    const isClosingBlock = /^<\/(ul|ol|pre|table|thead|tbody|div|blockquote)>/.test(trimmed);
    const isEmpty = trimmed === '';

    if (isEmpty) {
      if (inParagraph) {
        result.push('</p>');
        inParagraph = false;
      }
      result.push('');
    } else if (isBlockElement || isClosingBlock) {
      if (inParagraph) {
        result.push('</p>');
        inParagraph = false;
      }
      result.push(line);
    } else if (!inParagraph && trimmed && !trimmed.startsWith('<')) {
      result.push('<p>' + line);
      inParagraph = true;
    } else {
      result.push(line);
    }
  }

  if (inParagraph) {
    result.push('</p>');
  }

  // HTML comments (remove)
  html = result.join('\n').replace(/<!--[\s\S]*?-->/g, '');

  return html;
}

/**
 * Generate a page from template
 */
function generatePage(title, content, activePage) {
  let page = template
    .replace('{{TITLE}}', title)
    .replace('{{CONTENT}}', content)
    .replace('{{HOME_ACTIVE}}', activePage === 'home' ? 'active' : '')
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

// Build examples.html
console.log('Building examples.html...');
const examplesContent = `
<iframe src="examples/index.html" class="examples-frame" title="MAIDR Examples"></iframe>
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

// Copy docs folder static assets (if any besides template)
const docsSource = path.join(ROOT, 'docs');
if (fs.existsSync(docsSource)) {
  const files = fs.readdirSync(docsSource);
  for (const file of files) {
    if (file !== 'template.html') {
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
