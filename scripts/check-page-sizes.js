#!/usr/bin/env node

/**
 * Fails the docs build when a page grows past what Googlebot will read.
 *
 * The limits and exemptions live in `scripts/pageSizes.js`; this is the CLI
 * that runs last in `npm run docs`, prints the five largest files so growth
 * anywhere stays visible, and exits non-zero on an offender.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { findOffenders, HARD_LIMIT, SOFT_LIMIT } from './pageSizes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(__dirname, '..', '_site');

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

const offenders = findOffenders(pages);

if (offenders.length > 0) {
  console.error(`\ncheck-page-sizes: ${offenders.length} page(s) exceed their Googlebot-safe limit:`);
  for (const { file, size, limit } of offenders) {
    console.error(`  ${formatBytes(size).padStart(14)}  ${file} (limit ${formatBytes(limit)})`);
  }
  process.exit(1);
}

console.log(`\nAll indexable pages are within ${formatBytes(SOFT_LIMIT)} (${formatBytes(HARD_LIMIT)} for api/).`);
