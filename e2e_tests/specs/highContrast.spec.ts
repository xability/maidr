import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';
import { PiePlotPage } from '../page-objects/plots/pie-page';

/**
 * High contrast mode (C) recolours the chart in place, so what can break is
 * visible only in the rendered page: a fill that points at a definition the
 * browser cannot find paints nothing, and a snapshot taken wrong leaves the
 * chart recoloured after the mode is turned off.
 *
 * It also paints a dark backdrop behind the chart: the page's body when the
 * chart has its document to itself, and MAIDR's own article around the chart
 * when the page shows anything else, so a page the chart shares keeps its
 * own colours.
 */

const DARK = 'rgb(0, 0, 0)';

/** The element a Tab lands on in a MAIDR chart. */
const FOCUS_TARGET = '[id^="maidr-figure-"] [tabindex="0"]';

/** What is painted behind a chart, read from its document's body. */
interface Backdrop {
  /** The page's background, as the body computes it. */
  page: string;
  /** The body's own inline style. */
  pageStyle: string;
  /** The chart's background, as MAIDR's article computes it. */
  chart: string;
  /** The article's own inline style. */
  chartStyle: string;
}

/**
 * Reads the backdrop of the document `body` belongs to, which may be a
 * frame's.
 */
async function backdrop(body: Locator): Promise<Backdrop> {
  return body.evaluate((element) => {
    const article = element.querySelector<HTMLElement>('article[id^="maidr-article-"]');
    return {
      page: window.getComputedStyle(element).backgroundColor,
      pageStyle: (element as HTMLElement).style.cssText,
      chart: article === null ? '' : window.getComputedStyle(article).backgroundColor,
      chartStyle: article?.style.cssText ?? '',
    };
  });
}

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

  test('paints only the chart on a page that shows anything else', async ({ page }) => {
    // The page around the chart used to be painted black, and text it drew
    // in its own light boxes turned white on white.
    const barPage = new BarPlotPage(page);
    await barPage.navigateToBarPlot();
    await page.evaluate(() => {
      // Outside MAIDR's article: by now the chart's SVG is inside it.
      const heading = document.createElement('h1');
      heading.textContent = 'Tips by day';
      const note = document.createElement('p');
      note.textContent = 'Saturday had the most tips.';
      document.body.prepend(heading, note);
    });
    await barPage.activateMaidr();
    const before = await backdrop(page.locator('body'));

    await barPage.pressKey('c', 'turn high contrast on');
    const during = await backdrop(page.locator('body'));
    await barPage.pressKey('c', 'turn high contrast off');
    const after = await backdrop(page.locator('body'));

    expect(during.page).toBe(before.page);
    expect(during.pageStyle).toBe(before.pageStyle);
    expect(during.chart).toBe(DARK);
    expect(after.chartStyle).toBe('');
    expect(after.page).toBe(before.page);
    expect(after.pageStyle).toBe(before.pageStyle);
  });

  test('paints the whole frame a chart has to itself, and nothing of the page around it', async ({ page }) => {
    await page.goto('e2e_tests/fixtures/framed-chart.html');
    const frame = page.frameLocator('iframe');
    const target = frame.locator(FOCUS_TARGET);
    await target.waitFor({ state: 'attached' });
    const host = await backdrop(page.locator('body'));
    await target.focus();
    await frame.locator('#maidr-text-container').waitFor();

    await page.keyboard.press('c');
    const during = await backdrop(frame.locator('body'));
    const hostDuring = await backdrop(page.locator('body'));
    await page.keyboard.press('c');
    const after = await backdrop(frame.locator('body'));

    expect(during.page).toBe(DARK);
    expect(during.chartStyle).toBe('');
    expect(hostDuring).toEqual(host);
    expect(after.pageStyle).toBe('');
  });

  test('paints the whole page of a Plotly chart alone on it', async ({ page }) => {
    // Plotly leaves the SVG it measures text with in the body, parked off the
    // page, and draws its title, legend and toolbar beside MAIDR's article.
    // None of them is the page's own, so the page is still the chart's.
    await page.goto('e2e_tests/fixtures/plotly-alone.html');
    const target = page.locator(FOCUS_TARGET);
    await target.waitFor({ state: 'attached' });
    await expect(page.locator('body > svg#js-plotly-tester')).toHaveCount(1);
    const before = await backdrop(page.locator('body'));
    await target.focus();
    await page.locator('#maidr-text-container').waitFor();

    await page.keyboard.press('c');
    const during = await backdrop(page.locator('body'));
    await page.keyboard.press('c');
    const after = await backdrop(page.locator('body'));

    expect(during.page).toBe(DARK);
    expect(during.chartStyle).toBe('');
    expect(after.page).toBe(before.page);
    expect(after.pageStyle).toBe(before.pageStyle);
  });
});
