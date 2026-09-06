#!/usr/bin/env node

/**
 * Adds the site navbar to TypeDoc generated pages, and removes the generic
 * `<meta name="description">` TypeDoc hard-codes ("Documentation for <project
 * name>") so the per-page one from scripts/typedoc-seo-plugin.mjs is the only
 * description left. A renderer hook can add to <head> but not take from it,
 * which is why the removal lives here, in the pass that already rewrites
 * every page.
 *
 * Also rewrites the api/sitemap.xml TypeDoc writes from `hostedBaseUrl`: its
 * first entry is `api/index.html` while the canonical TypeDoc puts on that
 * page is `api/`, and every entry carries the build time as <lastmod>, which
 * Google learns to ignore. The entry becomes the canonical and the lastmod
 * the date of the last commit touching src/, which is what the API pages are
 * generated from.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lastCommitDate } from './gitDates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
      <li><a href="../react.html" style="color: white; text-decoration: none; font-weight: 500; padding: 0.5rem 1rem; border-radius: 6px;">React</a></li>
      <li><a href="../plotly.html" style="color: white; text-decoration: none; font-weight: 500; padding: 0.5rem 1rem; border-radius: 6px;">Plotly</a></li>
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
    .replace(/\.\.\/react\.html/g, `${prefix}react.html`)
    .replace(/\.\.\/plotly\.html/g, `${prefix}plotly.html`)
    .replace(/\.\.\/examples\.html/g, `${prefix}examples.html`)
    .replace(/\.\.\/api\/index\.html/g, `${prefix}api/index.html`)
    .replace(/\.\.\/media\//g, `${prefix}media/`);

  // Drop TypeDoc's generic description; the SEO plugin emitted a per-page one.
  content = content.replace(/<meta name="description" content="Documentation for [^"]*"\s*\/?>\n?/, '');

  // Insert navbar after <body> tag
  content = content.replace(/<body[^>]*>/, match => `${match}\n${adjustedNavbar}`);

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`Added navbar to ${path.relative(SITE_DIR, filePath)}`);
}

/**
 * Rewrite the TypeDoc sitemap so its index entry matches the canonical and
 * its lastmod is a real content date rather than the build time.
 */
function fixSitemap() {
  const sitemapPath = path.join(API_DIR, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    console.warn('No api/sitemap.xml found; is hostedBaseUrl set in typedoc.json?');
    return;
  }
  // The API pages are generated from `src/`, so that is what dates them.
  const today = new Date().toISOString().split('T')[0];
  const lastmod = lastCommitDate(path.join(__dirname, '..'), 'src', today);
  const sitemap = fs.readFileSync(sitemapPath, 'utf-8')
    .replace('<loc>https://maidr.ai/api/index.html</loc>', '<loc>https://maidr.ai/api/</loc>')
    .replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${lastmod}</lastmod>`);
  fs.writeFileSync(sitemapPath, sitemap, 'utf-8');
  console.log(`Rewrote api/sitemap.xml (lastmod ${lastmod})`);
}

// Main
console.log('Adding navbar to TypeDoc pages...');
const htmlFiles = findHTMLFiles(API_DIR);
console.log(`Found ${htmlFiles.length} HTML files`);

htmlFiles.forEach(processHTMLFile);
fixSitemap();

console.log('Done!');
