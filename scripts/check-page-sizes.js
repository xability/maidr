#!/usr/bin/env node

/**
 * Fails the docs build when a page grows past what Googlebot will read.
 *
 * Googlebot fetches the first 2 MB (2,097,152 bytes, uncompressed) of an HTML
 * file and discards the rest, so anything after that point is invisible to
 * search and to the AI features built on it. The cap here is 1,900,000 bytes
 * to leave headroom.
 *
 * `_site/examples/` and `_site/api/` are exempt: the examples are demo files
 * marked noindex (the single-file Recharts bundle sits right at the limit),
 * and the TypeDoc pages top out around 860 KB because the hierarchy theme
 * inlines the navigation tree into each one. The five largest files overall
 * are still printed so growth in either stays visible.
 *
 * Runs last in `npm run docs`.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(__dirname, '..', '_site');
const LIMIT = 1_900_000;
const EXEMPT_DIRS = new Set(['examples', 'api']);

/** Every .html file under `dir`, recursively. */
function findHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findHtmlFiles(full, files);
    } else if (entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

/** The path relative to `_site/`, with forward slashes. */
function siteRelative(file) {
  return path.relative(SITE_DIR, file).split(path.sep).join('/');
}

function formatBytes(size) {
  return `${size.toLocaleString('en-US')} B`;
}

if (!fs.existsSync(SITE_DIR)) {
  console.error(`check-page-sizes: ${SITE_DIR} does not exist; run the docs build first.`);
  process.exit(1);
}

const pages = findHtmlFiles(SITE_DIR)
  .map(file => ({ file: siteRelative(file), size: fs.statSync(file).size }))
  .sort((a, b) => b.size - a.size);

console.log('Largest HTML files in _site/:');
for (const { file, size } of pages.slice(0, 5)) {
  console.log(`  ${formatBytes(size).padStart(14)}  ${file}`);
}

const offenders = pages.filter(({ file, size }) => !EXEMPT_DIRS.has(file.split('/')[0]) && size > LIMIT);

if (offenders.length > 0) {
  console.error(`\ncheck-page-sizes: ${offenders.length} page(s) exceed ${formatBytes(LIMIT)}, the Googlebot-safe limit:`);
  for (const { file, size } of offenders) {
    console.error(`  ${formatBytes(size).padStart(14)}  ${file}`);
  }
  process.exit(1);
}

console.log(`\nAll indexable pages are under ${formatBytes(LIMIT)}.`);
