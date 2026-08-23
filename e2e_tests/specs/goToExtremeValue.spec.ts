import type { Maidr, MaidrLayer } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';

/**
 * The x label of the bar carrying the layer's lowest or highest y value.
 *
 * Read from the example's own data rather than hardcoded: the assertion is
 * "the cursor is on the extreme bar", and pinning a label here would keep
 * passing if the example's numbers changed underneath it.
 * @param layer - The bar layer to search.
 * @param extreme - Which end of the range to find.
 * @returns The x label of that bar.
 */
function extremeBarLabel(layer: MaidrLayer | undefined, extreme: 'min' | 'max'): string {
  if (!Array.isArray(layer?.data) || layer.data.length === 0) {
    throw new TypeError('Bar layer data is missing or not an array');
  }

  const winner = layer.data.reduce((best, point) => {
    const value = Number((point as { y: number }).y);
    const bestValue = Number((best as { y: number }).y);
    return extreme === 'min'
      ? (value < bestValue ? point : best)
      : (value > bestValue ? point : best);
  });

  return String((winner as { x: unknown }).x);
}

test.describe('Go to extreme value', () => {
  let barLayer: MaidrLayer;
  let minLabel: string;
  let maxLabel: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const barPlotPage = new BarPlotPage(page);
      await barPlotPage.navigateToBarPlot();
      await page.waitForSelector(`svg#${TestConstants.BAR_ID}`, { timeout: 10000 });

      const maidrData: Maidr = await extractMaidrData(page);
      barLayer = maidrData.subplots[0][0].layers[0];
      minLabel = extremeBarLabel(barLayer, 'min');
      maxLabel = extremeBarLabel(barLayer, 'max');
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new BarPlotPage(page).navigateToBarPlot();
  });

  test('should distinguish the two extremes', async () => {
    // A layer whose lowest and highest bar were the same one would let a
    // broken binding pass both cases below.
    expect(minLabel).not.toEqual(maxLabel);
  });

  test('should jump to the highest bar on the close bracket', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.goToMaximumValue();

    expect(await barPlotPage.getCurrentDataPointInfo()).toContain(maxLabel);
  });

  test('should jump to the lowest bar on the open bracket', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.goToMinimumValue();

    expect(await barPlotPage.getCurrentDataPointInfo()).toContain(minLabel);
  });

  test('should reach an extreme from anywhere, not just from the entry point', async ({ page }) => {
    // Pressing the key on the first bar could pass by doing nothing at all if
    // the first bar happened to be the extreme; walking away first means the
    // cursor has to actually move to land there.
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.moveToLastDataPoint();
    await barPlotPage.goToMinimumValue();
    expect(await barPlotPage.getCurrentDataPointInfo()).toContain(minLabel);

    await barPlotPage.goToMaximumValue();
    expect(await barPlotPage.getCurrentDataPointInfo()).toContain(maxLabel);
  });
});
