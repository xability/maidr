#!/usr/bin/env node

/**
 * Adds the site navbar to TypeDoc generated pages
 */

const fs = require('node:fs');
const path = require('node:path');

const SITE_DIR = path.join(__dirname, '..', '_site');
const API_DIR = path.join(SITE_DIR, 'api');

const navbarHTML = `
<style>
  #maidr-site-navbar {
    background: black !important;
    padding: 1rem 2rem !important;
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    z-index: 99999 !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif !important;
  }
  body {
    padding-top: 72px !important;
  }
</style>
<nav id="maidr-site-navbar">
  <div style="
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
  ">
    <a href="../index.html" style="
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: white;
      font-weight: bold;
      font-size: 1.5rem;
    ">
      <img src="../media/logo.jpg" alt="MAIDR Logo" style="height: 40px; width: 40px; border-radius: 6px;" />
      MAIDR
    </a>
    <ul style="
      list-style: none;
      display: flex;
      gap: 2rem;
      margin: 0;
      padding: 0;
    ">
      <li><a href="../index.html" style="color: white; text-decoration: none; font-weight: 500; padding: 0.5rem 1rem; border-radius: 6px;">Home</a></li>
      <li><a href="../examples.html" style="color: white; text-decoration: none; font-weight: 500; padding: 0.5rem 1rem; border-radius: 6px;">Examples</a></li>
      <li><a href="../api/index.html" style="color: white; text-decoration: none; font-weight: 500; padding: 0.5rem 1rem; border-radius: 6px; background: rgba(255, 255, 255, 0.2);">API Documentation</a></li>
      <li><a href="https://github.com/xability/maidr" target="_blank" style="color: white; text-decoration: none; font-weight: 500; padding: 0.5rem 1rem; border-radius: 6px;">GitHub</a></li>
    </ul>
  </div>
</nav>
`;

/**
 * Recursively find all HTML files in a directory
 */
function findHTMLFiles(dir, files = []) {
  if (!fs.existsSync(dir))
    return files;

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

/**
 * Calculate relative path depth for a file
 */
function getRelativePrefix(filePath) {
  const relativePath = path.relative(API_DIR, filePath);
  const depth = relativePath.split(path.sep).length - 1;
  return '../'.repeat(depth + 1); // +1 to get out of api/ folder
}

/**
 * Process a single HTML file
 */
function processHTMLFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');

  // Skip if navbar already added
  if (content.includes('maidr-site-navbar')) {
    console.log(`Skipping ${filePath} (navbar exists)`);
    return;
  }

  // Calculate relative path prefix
  const prefix = getRelativePrefix(filePath);

  // Adjust navbar links for this file's depth
  const adjustedNavbar = navbarHTML
    .replace(/\.\.\/index\.html/g, `${prefix}index.html`)
    .replace(/\.\.\/examples\.html/g, `${prefix}examples.html`)
    .replace(/\.\.\/api\/index\.html/g, `${prefix}api/index.html`)
    .replace(/\.\.\/media\//g, `${prefix}media/`);

  // Insert navbar after <body> tag
  content = content.replace(/<body[^>]*>/, match => `${match}\n${adjustedNavbar}`);

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`Added navbar to ${path.relative(SITE_DIR, filePath)}`);
}

// Main
console.log('Adding navbar to TypeDoc pages...');
const htmlFiles = findHTMLFiles(API_DIR);
console.log(`Found ${htmlFiles.length} HTML files`);

htmlFiles.forEach(processHTMLFile);

console.log('Done!');
