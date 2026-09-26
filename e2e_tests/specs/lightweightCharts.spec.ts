import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { modifierKey } from '../utils/platform';

/**
 * E2E coverage for the TradingView Lightweight Charts adapter
 * (`dist/lightweight-charts.js`), driven through its two example pages:
 *
 * - examples/lightweight-charts.html -- candlesticks and a moving average in
 *   one pane, volume in a second
 * - examples/lightweight-charts-live.html -- a simulated feed calling
 *   `series.update()`, which the binding follows on its own
 *
 * The pages load Lightweight Charts from a CDN, as a reader's page would; the
 * request is answered from `node_modules` here so the spec needs no network.
 * Like the live-data spec, it drives the pages directly rather than through a
 * page object: what it checks is the binding, not a standard plot fixture.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const library = readFileSync(
  path.join(root, 'node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js'),
  'utf8',
);

async function open(page: Page, example: string): Promise<void> {
  await page.route('**/lightweight-charts@5/**', route =>
    route.fulfill({ contentType: 'text/javascript', body: library }));
  await page.goto(`examples/${example}`);
  await page.waitForFunction(() => (window as unknown as { maidrBinding?: unknown }).maidrBinding !== undefined);
}

/** Polls until MAIDR's text region contains `expected`. */
async function waitForText(page: Page, expected: string): Promise<void> {
  await page.waitForFunction(
    needle => (document.querySelector('[id^="react-container"]')?.textContent ?? '').includes(needle),
    expected,
    { timeout: 5000 },
  );
}

async function text(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector('[id^="react-container"]')?.textContent ?? '');
}

/** The highlight box drawn over the canvas, or null when none is drawn. */
async function highlight(page: Page): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate(() => {
    const box = document.querySelector('[data-maidr-lightweight-charts-highlight]');
    if (!box) {
      return null;
    }
    const { x, y, width, height } = box.getBoundingClientRect();
    return { x, y, width, height };
  });
}

/** Moves from the figure into the price pane, which sits above the volume pane. */
async function enterPricePane(page: Page, chart: string, name: string): Promise<void> {
  await page.click(chart);
  await waitForText(page, 'maidr figure');
  await page.keyboard.press('ArrowRight');
  await waitForText(page, 'Subplot 1 of 2, Volume');
  await page.keyboard.press('ArrowUp');
  await waitForText(page, `Subplot 2 of 2, ${name}`);
  await page.keyboard.press('Enter');
  await waitForText(page, 'candlestick plot');
}

test.describe('Lightweight Charts adapter', () => {
  test('reads each pane as a subplot and each series as a layer', async ({ page }) => {
    await open(page, 'lightweight-charts.html');

    const layers = await page.evaluate(() => {
      const binding = (window as unknown as { maidrBinding: { maidr: { subplots: { layers: { type: string; title: string }[] }[][] } } }).maidrBinding;
      return binding.maidr.subplots.map(row => row[0].layers.map(layer => `${layer.type}:${layer.title}`));
    });

    expect(layers).toEqual([['bar:Volume'], ['candlestick:ACME', 'line:10-day average']]);
  });

  test('announces candles and highlights the one under the cursor', async ({ page }) => {
    await open(page, 'lightweight-charts.html');
    await enterPricePane(page, '#price-chart', 'ACME');

    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Date is 2025-01-02, close ACME is 98.08');
    const first = await highlight(page);
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Date is 2025-01-03');
    const second = await highlight(page);
    await page.keyboard.press('ArrowUp');
    await waitForText(page, 'high ACME is');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.height ?? 0).toBeGreaterThan(0);
    // One bar to the right, on the same row of candles.
    expect(second?.x ?? 0).toBeGreaterThan(first?.x ?? 0);
  });

  test('switches to the moving-average layer with PageUp', async ({ page }) => {
    await open(page, 'lightweight-charts.html');
    await enterPricePane(page, '#price-chart', 'ACME');
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'close ACME');

    await page.keyboard.press('PageUp');

    await waitForText(page, '10-day average is');
  });

  test('follows series.update(): revisions stay silent, a new candle is announced in monitor mode', async ({ page }) => {
    await open(page, 'lightweight-charts-live.html');
    await enterPricePane(page, '#ticker-chart', 'XYZ');
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Time is 2025-06-02 14:30');
    await page.keyboard.press('m');
    await waitForText(page, 'Monitoring on');

    // Ticks 1-4 revise the forming 14:49 candle in place.
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => (window as unknown as { feedTick: () => void }).feedTick());
    }
    await page.waitForTimeout(600); // settle: silence cannot be polled
    expect(await text(page)).toContain('Monitoring on');

    // Tick 5 opens the 14:50 candle: an append, which monitor mode announces.
    await page.evaluate(() => (window as unknown as { feedTick: () => void }).feedTick());
    await waitForText(page, 'Time is 2025-06-02 14:50');

    const counts = await page.evaluate(() => {
      const binding = (window as unknown as { maidrBinding: { maidr: { subplots: { layers: { data: unknown[] }[] }[][] } } }).maidrBinding;
      return binding.maidr.subplots.map(row => row[0].layers[0].data.length);
    });
    expect(counts).toEqual([21, 21]);

    // The reader stayed on 14:30: replaying the point reads it again.
    await page.keyboard.press('Space');
    await waitForText(page, 'Time is 2025-06-02 14:30');
    expect(await text(page)).not.toContain('14:50');

    // And can jump to the newest candle.
    await page.keyboard.press(`${await modifierKey(page)}+ArrowRight`);
    await waitForText(page, 'Time is 2025-06-02 14:50');
  });

  test('clears the highlight when focus leaves, and keeps it cleared as bars stream in', async ({ page }) => {
    await open(page, 'lightweight-charts-live.html');
    await enterPricePane(page, '#ticker-chart', 'XYZ');
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Time is 2025-06-02 14:30');
    expect(await highlight(page)).not.toBeNull();

    await page.click('#start');
    await page.click('#stop');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => (window as unknown as { feedTick: () => void }).feedTick());
    }
    await page.waitForTimeout(300); // settle: an absent box cannot be polled

    expect(await highlight(page)).toBeNull();
  });

  test('keeps a bar added in the same task as the binding', async ({ page }) => {
    await open(page, 'lightweight-charts-live.html');

    // Bind again and stream a new candle before MAIDR has mounted the figure.
    await page.evaluate(() => {
      const scope = window as unknown as {
        maidrBinding: { dispose: () => void };
        maidrLightweightCharts: { bindLightweightChart: (chart: unknown, options: unknown) => unknown };
      };
      scope.maidrBinding.dispose();
      // Top-level bindings of the example page.
      // eslint-disable-next-line no-eval
      const [lwcChart, lwcCandles] = eval('[chart, candles]') as [unknown, { update: (bar: unknown) => void }];
      scope.maidrBinding = scope.maidrLightweightCharts.bindLightweightChart(lwcChart, { id: 'lwc-live', title: 'XYZ live' }) as { dispose: () => void };
      lwcCandles.update({ time: Date.UTC(2025, 5, 2, 14, 50) / 1000, open: 251, high: 252, low: 250, close: 251.5 });
    });
    await enterPricePane(page, '#ticker-chart', 'XYZ');
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Time is 2025-06-02 14:30');

    await page.keyboard.press(`${await modifierKey(page)}+ArrowRight`);

    await waitForText(page, 'Time is 2025-06-02 14:50, close XYZ is 251.50');
  });
});
