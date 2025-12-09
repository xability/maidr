#!/usr/bin/env node

/**
 * Adds navigation back to the main Quarto documentation site
 * from TypeDoc generated pages
 */

const fs = require('fs');
const path = require('path');

// Navigation HTML to inject
const navigationHTML = `
<div id="maidr-nav-banner" style="
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 12px 20px;
  position: sticky;
  top: 0;
  z-index: 1000;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
">
  <div style="display: flex; align-items: center; gap: 20px;">
    <a href="../../api-reference.html" style="
      color: white;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
      padding: 8px 16px;
      background: rgba(255,255,255,0.2);
      border-radius: 6px;
      transition: all 0.3s ease;
    " onmouseover="this.style.background='rgba(255,255,255,0.3)'"
       onmouseout="this.style.background='rgba(255,255,255,0.2)'">
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path fill-rule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"/>
      </svg>
      Back to MAIDR Docs
    </a>
    <span style="color: white; opacity: 0.9; font-size: 14px;">
      TypeDoc API Reference
    </span>
  </div>
  <div style="display: flex; gap: 15px;">
    <a href="../../index.html" style="color: white; text-decoration: none; opacity: 0.9; hover: opacity: 1;">Home</a>
    <a href="../../examples.html" style="color: white; text-decoration: none; opacity: 0.9; hover: opacity: 1;">Examples</a>
    <a href="../../api-reference.html" style="color: white; text-decoration: none; opacity: 0.9; hover: opacity: 1;">API</a>
  </div>
</div>
`;

// Function to process HTML files
function processHTMLFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Check if navigation already exists
    if (content.includes('maidr-nav-banner')) {
      console.log(`Navigation already exists in ${filePath}`);
      return;
    }

    // Insert navigation after opening body tag
    content = content.replace(
      /<body[^>]*>/i,
      (match) => `${match}\n${navigationHTML}`
    );

    // Adjust the main content padding to account for sticky header
    content = content.replace(
      /<header class="tsd-page-toolbar">/i,
      '<header class="tsd-page-toolbar" style="margin-top: 60px;">'
    );

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Added navigation to ${filePath}`);
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

// Function to recursively find all HTML files
function findHTMLFiles(dir, files = []) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      findHTMLFiles(fullPath, files);
    } else if (item.endsWith('.html')) {
      files.push(fullPath);
    }
  }

  return files;
}

// Main execution
function main() {
  const docsDir = path.join(__dirname, '..', '_site', 'docs');

  if (!fs.existsSync(docsDir)) {
    console.error('TypeDoc output directory not found:', docsDir);
    process.exit(1);
  }

  const htmlFiles = findHTMLFiles(docsDir);
  console.log(`Found ${htmlFiles.length} HTML files to process`);

  htmlFiles.forEach(processHTMLFile);

  console.log('Navigation added successfully!');
}

// Run the script
main();