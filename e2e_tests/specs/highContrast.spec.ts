import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';
import { PiePlotPage } from '../page-objects/plots/pie-page';

/**
 * High contrast mode (C) recolours the chart in place, so what can break is
 * visible only in the rendered page: a fill that points at a definition the
 * browser cannot find paints nothing, and a snapshot taken wrong leaves the
 * chart recoloured after the mode is turned off.
 */

/**
 * Every colour the chart's SVG paints with, in document order.
 */
async function chartPaint(page: Page, svgSelector: string): Promise<string[]> {
  return page.locator(svgSelector).evaluate(svg =>
    Array.from(svg.querySelectorAll('*')).map((element) => {
      const style = window.getComputedStyle(element);
      return `${style.fill}|${style.stroke}|${style.backgroundColor}`;
    }));
}

test.describe('High contrast mode', () => {
  test('draws every pie wedge with a pattern the chart can resolve', async ({ page }) => {
    // The pie's SVG ships with no <defs>. The patterns used to be added to the
    // HTML wrapper around it instead, where a <pattern> renders nothing, and
    // every wedge vanished.
    const piePage = new PiePlotPage(page);
    await piePage.navigateToPiePlot();
    await piePage.activateMaidr();

    await piePage.pressKey('c', 'toggle high contrast');

    const unresolved = await page.locator('svg#pie').evaluate((svg) => {
      const missing: string[] = [];
      for (const slice of Array.from(svg.querySelectorAll('path.slice'))) {
        const fill = window.getComputedStyle(slice).fill;
        const id = fill.match(/url\("?#([^")]+)"?\)/)?.[1];
        if (id !== undefined && svg.querySelector(`#${CSS.escape(id)}`) === null) {
          missing.push(id);
        }
      }
      return missing;
    });
    const patterned = await page.locator('svg#pie pattern').count();

    expect(patterned).toBeGreaterThan(0);
    expect(unresolved).toEqual([]);
  });

  test('puts the chart back exactly as it was when turned off', async ({ page }) => {
    const barPage = new BarPlotPage(page);
    await barPage.navigateToBarPlot();
    await barPage.activateMaidr();
    const before = await chartPaint(page, 'svg#bar');

    await barPage.pressKey('c', 'turn high contrast on');
    const during = await chartPaint(page, 'svg#bar');
    await barPage.pressKey('c', 'turn high contrast off');
    const after = await chartPaint(page, 'svg#bar');

    expect(during).not.toEqual(before);
    expect(after).toEqual(before);
  });
});
