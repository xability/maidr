/**
 * Renders the Office add-in's icons, addin/assets/icon-<size>.png, from
 * addin/assets/icon.svg: the sizes the manifest's ribbon button and listing
 * use (16, 32, 64, 80), the ones Office scales to on high-density screens
 * (20, 24, 40, 48) and the Microsoft Marketplace's (128, 300).
 *
 * Run it after changing icon.svg, and commit the PNGs:
 *
 *     node scripts/render-addin-icons.mjs
 *
 * It renders in Playwright's Chromium, a development dependency. Set
 * CHROMIUM_PATH to use a Chromium installed elsewhere.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'addin', 'assets');

/** Every size rendered, in pixels. */
export const ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 80, 128, 300];

async function main() {
  const svg = readFileSync(path.join(ASSETS, 'icon.svg'), 'utf8');
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    for (const size of ICON_SIZES) {
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `);
      await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
      await page.screenshot({ path: path.join(ASSETS, `icon-${size}.png`), omitBackground: true });
      await page.close();
      console.log(`Wrote addin/assets/icon-${size}.png`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
