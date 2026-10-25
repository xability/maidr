import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * The text MAIDR shows below a chart never widens the chart's figure (#1438).
 *
 * The text is mounted as the reader comes into the chart: the instructions
 * first, then what they move to. In a figure sized to what it holds, as a
 * centred flex item is, the instructions on one line widened the figure to
 * its container, so the chart moved sideways as the reader came in, and back
 * as they left. The text now wraps at the chart's width. It still takes its
 * height below the chart, which is where what follows the chart moves.
 */

const PLOT = 'figure[id^="maidr-figure-"] > div[tabindex="0"]';

/** Where the chart's figure, the chart and the text shown below it are on the page. */
interface Layout {
  figureLeft: number;
  figureWidth: number;
  chartLeft: number;
  chartTop: number;
  chartWidth: number;
  chartHeight: number;
  textWidth: number | null;
}

/**
 * Centres what the page holds across it, so that the chart's figure is as
 * wide as what it holds, as a centred flex item is.
 * @param page - The Playwright page
 */
async function shrinkWrap(page: Page): Promise<void> {
  await page.addStyleTag({ content: 'body { display: flex; flex-direction: column; align-items: center; }' });
}

/**
 * Measures the figure, the chart and the text MAIDR shows below it, in page
 * coordinates, so that a scroll cannot pass for a move.
 * @param page - The Playwright page
 * @returns The layout
 */
async function layout(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const box = (element: Element): DOMRect => element.getBoundingClientRect();
    const figure = document.querySelector('figure[id^="maidr-figure-"]') as HTMLElement;
    const chart = figure.querySelector('svg') as SVGSVGElement;
    const text = document.getElementById('maidr-text-container');
    return {
      figureLeft: box(figure).left + window.scrollX,
      figureWidth: box(figure).width,
      chartLeft: box(chart).left + window.scrollX,
      chartTop: box(chart).top + window.scrollY,
      chartWidth: box(chart).width,
      chartHeight: box(chart).height,
      textWidth: text === null ? null : box(text).width,
    };
  });
}

/**
 * Takes the reader into the chart and out again, measuring the page before,
 * while they are in it and after.
 * @param page - The Playwright page
 * @returns The three layouts
 */
async function comeAndGo(page: Page): Promise<[Layout, Layout, Layout]> {
  const plot = page.locator(PLOT).first();
  const before = await layout(page);

  await plot.focus();
  await expect(page.locator('#maidr-text-container')).toContainText(/\S/);
  const inChart = await layout(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(page.locator('[id^="react-container-"]')).toHaveCount(0);
  const left = await layout(page);
  return [before, inChart, left];
}

for (const example of ['boxplot-horizontal', 'barplot']) {
  test(`keeps a centred ${example} chart where it is as the reader comes and goes`, async ({ page }) => {
    await page.goto(`examples/${example}.html`);
    await page.locator(PLOT).first().waitFor({ state: 'attached' });
    await shrinkWrap(page);

    const [before, inChart, left] = await comeAndGo(page);

    expect(before.figureWidth).toBeCloseTo(before.chartWidth, 0);
    for (const after of [inChart, left]) {
      expect(after.figureLeft).toBeCloseTo(before.figureLeft, 0);
      expect(after.figureWidth).toBeCloseTo(before.figureWidth, 0);
      expect(after.chartLeft).toBeCloseTo(before.chartLeft, 0);
      expect(after.chartTop).toBeCloseTo(before.chartTop, 0);
      expect(after.chartWidth).toBeCloseTo(before.chartWidth, 0);
      expect(after.chartHeight).toBeCloseTo(before.chartHeight, 0);
    }
    // The instructions wrap at the chart's width.
    expect(inChart.textWidth).toBeCloseTo(inChart.chartWidth, 0);
  });
}

test('keeps a centred chart where it is as the reader moves through its points', async ({ page }) => {
  await page.goto('examples/multiline_plot_intersection.html');
  await page.locator(PLOT).first().waitFor({ state: 'attached' });
  await shrinkWrap(page);
  // Narrower than what it says at a point three series meet, as on a slide.
  await page.addStyleTag({ content: 'figure[id^="maidr-figure-"] svg { width: 400px; height: auto; }' });

  const plot = page.locator(PLOT).first();
  const text = page.locator('#maidr-text-container');
  await plot.focus();
  await expect(text).toContainText(/\S/);
  const inChart = await layout(page);

  // Into the point series 1 and 2 share, whose text names both, and out of it
  // either way: each move says something of its own length.
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft']) {
    const said = await text.textContent();
    await page.keyboard.press(key);
    await expect(text).not.toHaveText(said ?? '');
    const moved = await layout(page);
    expect(moved.figureLeft).toBeCloseTo(inChart.figureLeft, 0);
    expect(moved.figureWidth).toBeCloseTo(inChart.figureWidth, 0);
    expect(moved.chartLeft).toBeCloseTo(inChart.chartLeft, 0);
    expect(moved.chartWidth).toBeCloseTo(inChart.chartWidth, 0);
    expect(moved.textWidth).toBeCloseTo(moved.chartWidth, 0);
  }
});

test('wraps the text at the chart\'s width in a host that does not wrap', async ({ page }) => {
  await page.goto('examples/barplot.html');
  await page.locator(PLOT).first().waitFor({ state: 'attached' });
  await shrinkWrap(page);
  // A <pre>, as Mermaid's own markup puts a diagram in, which every element
  // MAIDR shows inherits `white-space: pre` from.
  await page.evaluate(() => {
    const chart = document.querySelector('[data-maidr-embed]') as HTMLElement;
    const pre = document.createElement('pre');
    chart.before(pre);
    pre.append(chart);
  });
  const pageWidth = (): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth);
  const before = await pageWidth();

  await page.locator(PLOT).first().focus();
  await expect(page.locator('#maidr-text-container')).toContainText(/\S/);

  const inChart = await layout(page);
  const text = await page.locator('#maidr-text-container').evaluate(element => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(inChart.textWidth).toBeCloseTo(inChart.chartWidth, 0);
  expect(text.scrollWidth).toBeLessThanOrEqual(text.clientWidth + 1);
  // Nor does it widen the page.
  expect(await pageWidth()).toBe(before);
});

test('keeps a chart in the page flow where it is as the reader comes and goes', async ({ page }) => {
  await page.goto('examples/boxplot-horizontal.html');
  await page.locator(PLOT).first().waitFor({ state: 'attached' });

  const [before, inChart, left] = await comeAndGo(page);

  for (const after of [inChart, left]) {
    expect(after.chartLeft).toBeCloseTo(before.chartLeft, 0);
    expect(after.chartTop).toBeCloseTo(before.chartTop, 0);
    expect(after.chartWidth).toBeCloseTo(before.chartWidth, 0);
    expect(after.chartHeight).toBeCloseTo(before.chartHeight, 0);
  }
  // The text takes the figure's width, as it always has here.
  expect(inChart.textWidth).toBeCloseTo(inChart.figureWidth, 0);
});
