import type { Maidr, MaidrLayer } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';
import { TiedExtremesPage } from '../page-objects/plots/tiedExtremes-page';
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
    const cursor = async (): Promise<number | null> => brailleField.evaluate(
      field => (field as HTMLTextAreaElement).selectionStart,
    );

    // Entering a chart puts the cursor on the first cell, and in this example
    // the first bar is also the tallest — so jumping to the maximum first
    // would assert a position the cursor already held, and a key that did
    // nothing at all would pass. Going to the minimum first moves it away,
    // and only then does either direction have to travel.
    expect(await cursor()).toEqual(0);
    expect(min.index).not.toEqual(0);

    await barPlotPage.goToMinimumValue();

    expect(await brailleField.inputValue()).toEqual(before);
    expect(await cursor()).toEqual(min.index);

    await barPlotPage.goToMaximumValue();

    expect(await brailleField.inputValue()).toEqual(before);
    expect(await cursor()).toEqual(max.index);
  });
});

test.describe('Walking values tied at an extreme', () => {
  // The fixture's row is A=90, B=10, C=90, D=50, E=90, F=10 — no chart in
  // examples/ has a shared high or low, so nothing there can show a press
  // that has somewhere further to go.
  const MAX_SLOTS = ['A', 'C', 'E'];
  const MIN_SLOTS = ['B', 'F'];

  test.beforeEach(async ({ page }) => {
    await new TiedExtremesPage(page).navigateToTiedExtremes();
  });

  test('should step through every tied high and wrap back to the first', async ({ page }) => {
    const plot = new TiedExtremesPage(page);
    await plot.activateMaidr();

    for (const [press, slot] of [...MAX_SLOTS, MAX_SLOTS[0]].entries()) {
      await plot.goToMaximumValue();
      const info = await plot.getCurrentDataPointInfo();

      expect(info, `press ${press + 1} should land on ${slot}`).toContain(slot);
    }
  });

  test('should step through every tied low and wrap back to the first', async ({ page }) => {
    const plot = new TiedExtremesPage(page);
    await plot.activateMaidr();

    for (const [press, slot] of [...MIN_SLOTS, MIN_SLOTS[0]].entries()) {
      await plot.goToMinimumValue();
      const info = await plot.getCurrentDataPointInfo();

      expect(info, `press ${press + 1} should land on ${slot}`).toContain(slot);
    }
  });

  test('should say which tie it is on and how many there are', async ({ page }) => {
    const plot = new TiedExtremesPage(page);
    await plot.activateMaidr();

    await plot.goToMaximumValue();
    expect(await plot.getCurrentDataPointInfo()).toContain('1 of 3');

    await plot.goToMaximumValue();
    expect(await plot.getCurrentDataPointInfo()).toContain('2 of 3');

    // The count follows the value pressed for, not the last one walked.
    await plot.goToMinimumValue();
    expect(await plot.getCurrentDataPointInfo()).toContain('1 of 2');
  });

  test('should keep the point in the announcement alongside the position', async ({ page }) => {
    // The live region holds one message at a time, so appending the position
    // is what stops it replacing the point the reader pressed for.
    const plot = new TiedExtremesPage(page);
    await plot.activateMaidr();

    await plot.goToMaximumValue();
    const info = await plot.getCurrentDataPointInfo();

    expect(info).toContain('A');
    expect(info).toContain('90');
    expect(info).toContain('1 of 3');
  });

  test('should keep saying the position after text mode is made terse', async ({ page }) => {
    // Terse shortens the point description; it does not drop navigational
    // position — `Layer n of m` is announced in either mode. Here the count
    // is the only thing that says how many ties there are and when the walk
    // has come back round, and nothing in the point text carries that in
    // either mode, so terse is if anything where it matters more.
    const plot = new TiedExtremesPage(page);
    await plot.activateMaidr();

    // Assert the mode rather than trusting the cycle: `t` runs
    // verbose -> terse -> off, and a reordering there would otherwise leave
    // this passing from verbose and proving nothing.
    await plot.toggleTextMode();
    expect(await plot.getCurrentDataPointInfo()).toContain(TestConstants.TEXT_MODE_TERSE);

    await plot.goToMaximumValue();
    expect(await plot.getCurrentDataPointInfo()).toContain('1 of 3');

    await plot.goToMaximumValue();
    expect(await plot.getCurrentDataPointInfo()).toContain('2 of 3');
  });

  test('should stay silent about the position once text mode is off', async ({ page }) => {
    // Off is a choice to navigate by tone and braille. A notification
    // announces regardless of the text setting, so the position is the one
    // thing that could speak over that choice.
    const plot = new TiedExtremesPage(page);
    await plot.activateMaidr();

    await plot.toggleTextMode();
    await plot.toggleTextMode();
    expect(await plot.getCurrentDataPointInfo()).toContain(TestConstants.TEXT_MODE_OFF);

    await plot.goToMaximumValue();

    expect(await plot.getCurrentDataPointInfo()).not.toContain('of 3');
  });

  test('should walk the ties from braille mode too', async ({ page }) => {
    const plot = new TiedExtremesPage(page);
    await plot.activateMaidr();
    await plot.toggleBrailleMode();

    const brailleField = page.locator(`textarea[id^="${TestConstants.BRAILLE_TEXTAREA}"]`);
    const before = await brailleField.inputValue();
    const cursor = async (): Promise<number | null> => brailleField.evaluate(
      field => (field as HTMLTextAreaElement).selectionStart,
    );

    // A=90 is index 0 and also the first tie, so the walk has to start there
    // rather than skipping it, then step to C and E.
    for (const [press, index] of [0, 2, 4, 0].entries()) {
      await plot.goToMaximumValue();

      expect(await cursor(), `press ${press + 1} should sit on cell ${index}`).toEqual(index);
      expect(await brailleField.inputValue()).toEqual(before);
    }
  });
});
