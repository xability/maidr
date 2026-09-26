import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * E2E coverage for the uPlot adapter (`maidr/uplot`, #1303).
 *
 * Drives the examples under `examples/uplot/`, which load uPlot from jsdelivr
 * and the adapter from `dist/uplot.js`. The CDN requests are served from
 * `node_modules/uplot/dist` so the spec needs no network. Requires a built
 * adapter bundle (`node scripts/build.js uplot`).
 *
 * The examples' x values are UTC timestamps, so the browser runs in UTC to
 * keep the date-formatted announcements stable.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const uplotDist = path.join(repoRoot, 'node_modules/uplot/dist');

const TEXT = '#maidr-text-container';
const FOCUS_TARGET = '[id^="maidr-figure-"] [tabindex="0"]';
const HIGHLIGHT = '.u-over [data-maidr-uplot-highlight]';

test.use({ timezoneId: 'UTC', locale: 'en-US' });

/** Serves the pinned uPlot CDN files from the local devDependency. */
async function routeUPlot(page: Page): Promise<void> {
  await page.route('https://cdn.jsdelivr.net/npm/uplot@*/dist/*', async (route) => {
    const file = path.join(uplotDist, path.basename(new URL(route.request().url()).pathname));
    await route.fulfill({
      body: fs.readFileSync(file),
      contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript',
    });
  });
}

/** Opens a uPlot example and focuses its MAIDR plot. */
async function openExample(page: Page, name: string): Promise<void> {
  await routeUPlot(page);
  await page.goto(`examples/uplot/${name}.html`);
  const target = page.locator(FOCUS_TARGET).first();
  await target.waitFor({ state: 'attached' });
  await target.focus();
}

/** The current text-mode announcement. */
async function announcement(page: Page): Promise<string> {
  return (await page.locator(TEXT).textContent()) ?? '';
}

/** Presses a key and waits for the announcement to change from what it was. */
async function pressAndWait(page: Page, key: string): Promise<string> {
  const before = await announcement(page);
  await page.keyboard.press(key);
  await expect.poll(() => announcement(page)).not.toBe(before);
  return announcement(page);
}

/** The highlight box's rectangle and that of the plot area it sits in. */
async function highlightGeometry(page: Page): Promise<{
  box: { x: number; y: number; width: number; height: number };
  plot: { x: number; y: number; width: number; height: number };
}> {
  const box = await page.locator(HIGHLIGHT).first().boundingBox();
  const plot = await page.locator('.u-over').first().boundingBox();
  if (!box || !plot) {
    throw new Error('highlight or plot area is not rendered');
  }
  return { box, plot };
}

test.describe('uPlot adapter', () => {
  test('line: announces a date-formatted time, switches series, highlights the point', async ({ page }) => {
    await openExample(page, 'line');

    const first = await pressAndWait(page, 'ArrowRight');
    expect(first).toContain('Time is Jan 12, 9:00 AM');
    expect(first).toContain('Utilisation (%) is 35');
    expect(first).toContain('CPU %');

    await expect(page.locator(HIGHLIGHT).first()).toBeVisible();

    const switched = await pressAndWait(page, 'ArrowUp');
    expect(switched).toContain('Memory %');
    expect(switched).toContain('Time is Jan 12, 9:00 AM');
    await expect(page.locator(HIGHLIGHT).first()).toBeVisible();
  });

  test('bar: navigates the bars and highlights one inside the plot area', async ({ page }) => {
    await openExample(page, 'bar');

    const first = await pressAndWait(page, 'ArrowRight');
    expect(first).toContain('1820');
    const second = await pressAndWait(page, 'ArrowRight');
    expect(second).toContain('2140');

    await expect(page.locator(HIGHLIGHT).first()).toBeVisible();
    const { box, plot } = await highlightGeometry(page);
    expect(box.height).toBeGreaterThan(0);
    expect(box.width).toBeGreaterThan(0);
    // One pixel of slack for subpixel rounding of the box edges.
    expect(box.x).toBeGreaterThanOrEqual(plot.x - 1);
    expect(box.y).toBeGreaterThanOrEqual(plot.y - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(plot.x + plot.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(plot.y + plot.height + 1);
  });

  test('scatter: navigates the points', async ({ page }) => {
    await openExample(page, 'scatter');

    const first = await pressAndWait(page, 'ArrowRight');
    expect(first).toContain('12');
    const second = await pressAndWait(page, 'ArrowRight');
    expect(second).toContain('15');
    expect(second).not.toBe(first);
    await expect(page.locator(HIGHLIGHT).first()).toBeVisible();
  });

  test('live: monitor mode announces streamed points and Ctrl+ArrowRight reaches the newest', async ({ page }) => {
    await openExample(page, 'live');

    const firstPoint = await pressAndWait(page, 'ArrowRight');
    expect(firstPoint).toContain('Time is ');
    await page.keyboard.press('m');

    // The example appends a reading every 2 s (and drops the oldest). Each
    // one is announced, so the text comes to name the newest reading. The
    // page's `times` / `values` are top-level `const`s, reachable by name.
    const firstTime = await page.evaluate('times[0]') as number;
    await expect.poll(async () => {
      const newest = await page.evaluate('values[values.length - 1]');
      const text = await announcement(page);
      return (await page.evaluate('times[0]') as number) > firstTime
        && text !== firstPoint
        && text.includes('Time is ')
        && text.includes(`Messages is ${newest}`);
    }, { timeout: 10000 }).toBe(true);

    // Freeze the stream so the newest point is stable, move to the oldest
    // point, and jump back to the newest with Ctrl+ArrowRight. (Monitor mode
    // announces a new reading without moving the navigation position.)
    await page.evaluate('stop()');
    const newest = await page.evaluate('values[values.length - 1]') as number;
    const oldest = await page.evaluate('values[0]') as number;
    await page.keyboard.press('Control+ArrowLeft');
    await expect.poll(() => announcement(page)).toContain(`Messages is ${oldest}`);
    await page.keyboard.press('Control+ArrowRight');
    await expect.poll(() => announcement(page)).toContain(`Messages is ${newest}`);
  });
});
