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
 *
 * Unlike the other specs, this one drives the page directly instead of a
 * BasePage-derived page object: it targets the live-data demo pages and the
 * public `window.maidrLive` API surface rather than the standard plot
 * fixtures the page objects model. Positive announcement assertions poll
 * via waitForFunction; only silence assertions (asserting the *absence* of
 * an announcement) use a fixed settle wait, since absence cannot be polled.
 */

/** Reads the MAIDR aria text region for the active chart. */
async function ariaText(page: Page): Promise<string> {
  return page.evaluate(
    () => document.querySelector('[id^="react-container"]')?.textContent ?? '',
  );
}

/**
 * Polls until the aria text region contains the expected substring.
 * Fails the test via Playwright's timeout if it never appears.
 */
async function waitForAriaText(page: Page, expected: string): Promise<void> {
  await page.waitForFunction(
    (needle) => {
      const text = document.querySelector('[id^="react-container"]')?.textContent ?? '';
      return text.includes(needle);
    },
    expected,
    { timeout: 5000 },
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
    await waitForAriaText(page, 'maidr plot'); // focus-in shows the instruction
    await page.keyboard.press('ArrowRight'); // initial entry -> first point
    await waitForAriaText(page, '50');
    await page.keyboard.press('ArrowRight'); // second point (x=1, y=52)
    await waitForAriaText(page, '52');

    const ok = await append(page, { x: 3, y: 64.5 }, { id: 'live-sensor' });
    expect(ok).toBe(true);
    await page.waitForTimeout(600); // settle: silence cannot be polled

    // The aria region still shows the pre-append point; nothing announced.
    const text = await ariaText(page);
    expect(text).toContain('52');
    expect(text).not.toContain('64.5');
  });

  test('sliding-window trim keeps the cursor on the same data point', async ({ page }) => {
    await page.goto('examples/live-line.html');
    await page.click('#live-sensor');
    await waitForAriaText(page, 'maidr plot'); // focus-in shows the instruction
    await page.keyboard.press('ArrowRight'); // first point (x=0, y=50)
    await waitForAriaText(page, '50');
    await page.keyboard.press('ArrowRight'); // second point (x=1, y=52)
    await waitForAriaText(page, '52');

    // The layer starts with 3 points and maxWidth 20: 18 appends overflow the
    // window by one, trimming x=0 off the front. The cursor must shift left
    // with its data so it stays on x=1 (y=52) rather than sliding to x=2.
    await page.evaluate(() => {
      for (let i = 0; i < 18; i++) {
        (window as any).maidrLive.appendData(
          { x: 3 + i, y: 100 + i },
          { id: 'live-sensor' },
        );
      }
    });

    // From x=1, the next point right is x=2 (y=49). Without the shift the
    // cursor would already sit on x=2 and step onto the first appended
    // point (y=100) instead.
    await page.keyboard.press('ArrowRight');
    await waitForAriaText(page, '49');
    expect(await ariaText(page)).not.toContain('100');
  });

  test('nested layers: only the focused series is announced', async ({ page }) => {
    await page.goto('examples/live-line.html');
    await page.click('#live-sensor');
    await waitForAriaText(page, 'maidr plot'); // focus-in shows the instruction
    await page.keyboard.press('ArrowRight'); // land on series 0
    await waitForAriaText(page, '50');
    await page.keyboard.press('m'); // monitor on
    await waitForAriaText(page, 'Monitoring on');

    // Start a second series; the user is on series 0, so this stays silent.
    const otherSeries = await append(
      page,
      { x: 99, y: 77.5 },
      { id: 'live-sensor', groupIndex: 1 },
    );
    expect(otherSeries).toBe(true);
    await page.waitForTimeout(600); // settle: silence cannot be polled
    expect(await ariaText(page)).not.toContain('77.5');

    // An append to the focused series is announced.
    await append(page, { x: 3, y: 64.5 }, { id: 'live-sensor', groupIndex: 0 });
    await waitForAriaText(page, '64.5');
  });

  test('multi-layer ticker: only the focused layer is announced', async ({ page }) => {
    await page.goto('examples/live-candlestick.html');
    await page.click('#live-ticker');
    await waitForAriaText(page, 'maidr plot'); // focus-in shows the instruction
    await page.keyboard.press('ArrowRight'); // candle layer, first candle
    await waitForAriaText(page, '09:30');

    // Move to the moving-average layer and enable monitoring.
    await page.keyboard.press('PageUp'); // volume layer
    await waitForAriaText(page, 'Layer 2 of 3');
    await page.keyboard.press('PageUp'); // MA layer
    await waitForAriaText(page, 'Layer 3 of 3');
    await page.keyboard.press('m');
    await waitForAriaText(page, 'Monitoring on');

    // A candle-only append targets an unfocused layer: silent.
    await append(
      page,
      { value: '09:34', open: 99.25, high: 104, low: 99, close: 103.5 },
      { id: 'live-ticker', layerId: 'candle-layer' },
    );
    await page.waitForTimeout(600); // settle: silence cannot be polled
    expect(await ariaText(page)).not.toContain('103.5');

    // A full tick announces only the focused (MA) layer's point. The focused
    // layer's append lands FIRST so the unfocused appends come after it:
    // without the gate they would overwrite the announcement (last write
    // wins), which is what makes the negative assertions regression-sensitive.
    await append(page, { x: '09:35', y: 101.5 }, { id: 'live-ticker', layerId: 'ma-layer' });
    await waitForAriaText(page, '101.5');
    await append(
      page,
      { value: '09:35', open: 103.5, high: 106, low: 103, close: 105.25 },
      { id: 'live-ticker', layerId: 'candle-layer' },
    );
    await append(page, { x: '09:35', y: 1700 }, { id: 'live-ticker', layerId: 'volume-layer' });
    await page.waitForTimeout(600); // settle: silence cannot be polled
    let text = await ariaText(page);
    expect(text).toContain('101.5');
    expect(text).not.toContain('105.25');
    expect(text).not.toContain('1,700');

    // Switch focus back to the candle layer: the next tick announces the
    // close price and nothing else. Same ordering trick: focused layer first,
    // then the unfocused appends, so a broken gate would overwrite the text.
    await page.keyboard.press('PageDown');
    await waitForAriaText(page, 'Layer 2 of 3');
    await page.keyboard.press('PageDown');
    await waitForAriaText(page, 'Layer 1 of 3');
    await append(
      page,
      { value: '09:36', open: 105.25, high: 108, low: 105, close: 107.75 },
      { id: 'live-ticker', layerId: 'candle-layer' },
    );
    await waitForAriaText(page, '107.75');
    await append(page, { x: '09:36', y: 1400 }, { id: 'live-ticker', layerId: 'volume-layer' });
    await append(page, { x: '09:36', y: 104.25 }, { id: 'live-ticker', layerId: 'ma-layer' });
    await page.waitForTimeout(600); // settle: silence cannot be polled
    text = await ariaText(page);
    expect(text).toContain('107.75');
    expect(text).not.toContain('104.25');
    expect(text).not.toContain('1,400');
  });
});
