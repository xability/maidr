import type { Maidr, MaidrLayer } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';

/**
 * The x label and column of the bar carrying the layer's lowest or highest
 * y value.
 *
 * Read from the example's own data rather than hardcoded: the assertion is
 * "the cursor is on the extreme bar", and pinning a label here would keep
 * passing if the example's numbers changed underneath it.
 * @param layer - The bar layer to search.
 * @param extreme - Which end of the range to find.
 * @returns The bar's x label and its index in the row.
 */
function extremeBar(
  layer: MaidrLayer | undefined,
  extreme: 'min' | 'max',
): { label: string; index: number } {
  if (!Array.isArray(layer?.data) || layer.data.length === 0) {
    throw new TypeError('Bar layer data is missing or not an array');
  }

  let index = 0;
  const winner = layer.data.reduce((best, point, at) => {
    const value = Number((point as { y: number }).y);
    const bestValue = Number((best as { y: number }).y);
    const wins = extreme === 'min' ? value < bestValue : value > bestValue;
    if (wins) {
      index = at;
      return point;
    }
    return best;
  });

  return { label: String((winner as { x: unknown }).x), index };
}

test.describe('Go to extreme value', () => {
  let barLayer: MaidrLayer;
  let min: { label: string; index: number };
  let max: { label: string; index: number };

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const barPlotPage = new BarPlotPage(page);
      await barPlotPage.navigateToBarPlot();
      await page.waitForSelector(`svg#${TestConstants.BAR_ID}`, { timeout: 10000 });

      const maidrData: Maidr = await extractMaidrData(page);
      barLayer = maidrData.subplots[0][0].layers[0];
      min = extremeBar(barLayer, 'min');
      max = extremeBar(barLayer, 'max');
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
    expect(min.label).not.toEqual(max.label);
  });

  test('should jump to the highest bar on the close bracket', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.goToMaximumValue();

    expect(await barPlotPage.getCurrentDataPointInfo()).toContain(max.label);
  });

  test('should jump to the lowest bar on the open bracket', async ({ page }) => {
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.goToMinimumValue();

    expect(await barPlotPage.getCurrentDataPointInfo()).toContain(min.label);
  });

  test('should reach an extreme from anywhere, not just from the entry point', async ({ page }) => {
    // Pressing the key on the first bar could pass by doing nothing at all if
    // the first bar happened to be the extreme; walking away first means the
    // cursor has to actually move to land there.
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    await barPlotPage.moveToLastDataPoint();
    await barPlotPage.goToMinimumValue();
    expect(await barPlotPage.getCurrentDataPointInfo()).toContain(min.label);

    await barPlotPage.goToMaximumValue();
    expect(await barPlotPage.getCurrentDataPointInfo()).toContain(max.label);
  });

  test('should jump from braille mode without typing into the text area', async ({ page }) => {
    // The brackets are bound in BRAILLE scope, where the focused element is a
    // text area. Two things have to hold at once and only a browser can show
    // it: the keypress moves the braille cursor to the extreme cell, and the
    // bracket character never reaches the field.
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();
    await barPlotPage.toggleBrailleMode();

    const brailleField = page.locator(`textarea[id^="${TestConstants.BRAILLE_TEXTAREA}"]`);
    const before = await brailleField.inputValue();

    await barPlotPage.goToMaximumValue();

    expect(await brailleField.inputValue()).toEqual(before);
    expect(await brailleField.evaluate(field => (field as HTMLTextAreaElement).selectionStart))
      .toEqual(max.index);

    await barPlotPage.goToMinimumValue();

    expect(await brailleField.inputValue()).toEqual(before);
    expect(await brailleField.evaluate(field => (field as HTMLTextAreaElement).selectionStart))
      .toEqual(min.index);
  });
});
