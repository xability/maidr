import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * E2E coverage for live/streaming data updates and monitor mode.
 *
 * Uses the offline simulated demos (no network needed):
 * - examples/live-line.html — single/multi-series line chart
 * - examples/live-candlestick.html — multi-layer ticker (candle + volume + MA)
 *
 * Requires a built bundle (dist/maidr.js), like every other spec.
 */

/** Reads the MAIDR aria text region for the active chart. */
async function ariaText(page: Page): Promise<string> {
  return page.evaluate(
    () => document.querySelector('[id^="react-container"]')?.textContent ?? '',
  );
}

/** Appends a point through the public live API inside the page. */
async function append(page: Page, point: unknown, options: unknown): Promise<boolean> {
  return page.evaluate(
    ([p, o]) => (window as any).maidrLive.appendData(p, o),
    [point, options],
  );
}

test.describe('live data: monitor mode focus', () => {
  test('append with monitor off is completely silent', async ({ page }) => {
    await page.goto('examples/live-line.html');
    await page.click('#live-sensor');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowRight'); // initial entry -> first point
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowRight'); // second point (x=1, y=52)
    await page.waitForTimeout(200);
    expect(await ariaText(page)).toContain('52');

    const ok = await append(page, { x: 3, y: 64.5 }, { id: 'live-sensor' });
    expect(ok).toBe(true);
    await page.waitForTimeout(300);

    // The aria region still shows the pre-append point; nothing announced.
    const text = await ariaText(page);
    expect(text).toContain('52');
    expect(text).not.toContain('64.5');
  });

  test('nested layers: only the focused series is announced', async ({ page }) => {
    await page.goto('examples/live-line.html');
    await page.click('#live-sensor');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowRight'); // land on series 0
    await page.waitForTimeout(200);
    await page.keyboard.press('m'); // monitor on
    await page.waitForTimeout(200);
    expect(await ariaText(page)).toContain('Monitoring on');

    // Start a second series; the user is on series 0, so this stays silent.
    const otherSeries = await append(
      page,
      { x: 99, y: 77.5 },
      { id: 'live-sensor', groupIndex: 1 },
    );
    expect(otherSeries).toBe(true);
    await page.waitForTimeout(300);
    expect(await ariaText(page)).not.toContain('77.5');

    // An append to the focused series is announced.
    await append(page, { x: 3, y: 64.5 }, { id: 'live-sensor', groupIndex: 0 });
    await page.waitForTimeout(300);
    expect(await ariaText(page)).toContain('64.5');
  });

  test('multi-layer ticker: only the focused layer is announced', async ({ page }) => {
    await page.goto('examples/live-candlestick.html');
    await page.click('#live-ticker');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowRight'); // candle layer, first candle
    await page.waitForTimeout(200);
    expect(await ariaText(page)).toContain('09:30');

    // Move to the moving-average layer and enable monitoring.
    await page.keyboard.press('PageUp'); // volume layer
    await page.waitForTimeout(250);
    await page.keyboard.press('PageUp'); // MA layer
    await page.waitForTimeout(250);
    await page.keyboard.press('m');
    await page.waitForTimeout(200);
    expect(await ariaText(page)).toContain('Monitoring on');

    // A candle-only append targets an unfocused layer: silent.
    await append(
      page,
      { value: '09:34', open: 99.25, high: 104, low: 99, close: 103.5 },
      { id: 'live-ticker', layerId: 'candle-layer' },
    );
    await page.waitForTimeout(300);
    expect(await ariaText(page)).not.toContain('103.5');

    // A full tick announces only the focused (MA) layer's point.
    await append(
      page,
      { value: '09:35', open: 103.5, high: 106, low: 103, close: 105.25 },
      { id: 'live-ticker', layerId: 'candle-layer' },
    );
    await append(page, { x: '09:35', y: 1700 }, { id: 'live-ticker', layerId: 'volume-layer' });
    await append(page, { x: '09:35', y: 101.5 }, { id: 'live-ticker', layerId: 'ma-layer' });
    await page.waitForTimeout(300);
    let text = await ariaText(page);
    expect(text).toContain('101.5');
    expect(text).not.toContain('105.25');
    expect(text).not.toContain('1,700');

    // Switch focus back to the candle layer: the next tick announces the
    // close price and nothing else.
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(250);
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(250);
    await append(
      page,
      { value: '09:36', open: 105.25, high: 108, low: 105, close: 107.75 },
      { id: 'live-ticker', layerId: 'candle-layer' },
    );
    await append(page, { x: '09:36', y: 1400 }, { id: 'live-ticker', layerId: 'volume-layer' });
    await append(page, { x: '09:36', y: 104.25 }, { id: 'live-ticker', layerId: 'ma-layer' });
    await page.waitForTimeout(300);
    text = await ariaText(page);
    expect(text).toContain('107.75');
    expect(text).not.toContain('104.25');
    expect(text).not.toContain('1,400');
  });
});
