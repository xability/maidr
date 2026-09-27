import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * E2E coverage for the Power BI adapter (`dist/powerbi.js`), driven through
 * its two example pages with real keypresses:
 *
 * - examples/powerbi-bar.html -- *chart mode*: the visual's own SVG is moved
 *   inside MAIDR's figure, and the page's `onNavigate` outlines the bars and
 *   writes down what `selectionManager.select()` would be handed
 * - examples/powerbi-line.html -- *companion mode*: MAIDR renders only its
 *   entry point beside a "native" chart, whose point the page highlights from
 *   `onNavigate` the way Power BI's cross-highlighting would
 *
 * No Power BI here: each page writes its data view by hand, in the shape
 * Power BI hands a visual. Like the live-data and Lightweight Charts specs,
 * this drives the pages directly rather than through a page object: what it
 * checks is the binding, not a standard plot fixture.
 *
 * Not covered: the focusable empty state. Neither example can filter its data
 * to nothing, so a reader of them never reaches it; the unit tests under
 * test/adapters/powerbi cover it.
 *
 * Requires a built bundle (dist/maidr.js, dist/powerbi.js), like every spec.
 */

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

/** The bar a categorical ref names, in the chart-mode example's drawing. */
function bar(page: Page, categoryIndex: number, valueColumnIndex: number): Locator {
  return page.locator(
    `#visual rect.mark[data-category-index="${categoryIndex}"][data-value-column-index="${valueColumnIndex}"]`,
  );
}

/** The chart-mode example's log of what the visual would select. */
function selection(page: Page): Locator {
  return page.locator('#selection');
}

/** `categoryIndex/valueColumnIndex` of each outlined bar, in drawing order. */
async function outlinedBars(page: Page): Promise<string[]> {
  return page.locator('#visual rect.mark.highlighted').evaluateAll(nodes =>
    nodes.map(node => `${node.getAttribute('data-category-index')}/${node.getAttribute('data-value-column-index')}`));
}

/** `categoryIndex/valueColumnIndex` of each highlighted point on the native chart. */
async function nativeHighlights(page: Page): Promise<string[]> {
  return page.locator('#native circle.highlighted').evaluateAll(nodes =>
    nodes.map(node => `${node.getAttribute('data-category-index')}/${node.getAttribute('data-value-column-index')}`));
}

/** Focus the chart-mode figure by keyboard and wait for MAIDR's instruction. */
async function tabIntoBarChart(page: Page): Promise<void> {
  await page.goto('examples/powerbi-bar.html');
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-maidr-powerbi] [role="application"]')).toBeFocused();
  await waitForText(page, 'maidr plot of type: vertical dodged_bar');
}

test.describe('Power BI adapter: chart mode (powerbi-bar.html)', () => {
  test('moves the visual\'s own drawing inside MAIDR\'s figure', async ({ page }) => {
    await tabIntoBarChart(page);

    await expect(page.locator('#visual [data-maidr-powerbi] [data-maidr-powerbi-chart] > svg')).toHaveCount(1);
    await expect(selection(page)).toHaveText('Nothing selected.');
  });

  test('arrow keys announce quarter, region and value, and select the bar under the cursor', async ({ page }) => {
    await tabIntoBarChart(page);

    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q1, Sales is 120, Region is North');
    await expect(selection(page)).toHaveText('selectionManager.select([Quarter=Q1, Region=North, measure Sum(Orders.Sales)])');
    expect(await outlinedBars(page)).toEqual(['0/0']);
    await expect(page.locator('#visual')).toHaveClass(/dimmed/);

    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q2, Sales is 135, Region is North');
    await expect(selection(page)).toContainText('Quarter=Q2, Region=North');
    expect(await outlinedBars(page)).toEqual(['1/0']);

    await page.keyboard.press('ArrowUp');
    await waitForText(page, 'Quarter is Q2, Sales is 110, Region is South');
    await expect(selection(page)).toHaveText('selectionManager.select([Quarter=Q2, Region=South, measure Sum(Orders.Sales)])');
    expect(await outlinedBars(page)).toEqual(['1/1']);

    await page.keyboard.press('ArrowUp');
    await waitForText(page, 'Quarter is Q2, Sales is 95, Region is West');
    expect(await outlinedBars(page)).toEqual(['1/2']);

    await page.keyboard.press('ArrowLeft');
    await waitForText(page, 'Quarter is Q1, Sales is 100, Region is West');
    await expect(selection(page)).toContainText('Quarter=Q1, Region=West');
    expect(await outlinedBars(page)).toEqual(['0/2']);
  });

  test('a blank cell is announced as missing and clears the selection', async ({ page }) => {
    await tabIntoBarChart(page);
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q1');
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q2');
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q3, Sales is 150, Region is North');

    await page.keyboard.press('ArrowUp'); // South has no Q3 reading

    await waitForText(page, 'Quarter is Q3, Sales is missing, Region is South');
    await expect(selection(page)).toHaveText('A gap: no data point to select (selectionManager.clear()).');
    expect(await outlinedBars(page)).toEqual([]);
    await expect(page.locator('#visual')).not.toHaveClass(/dimmed/);

    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q4, Sales is 140, Region is South');
    expect(await outlinedBars(page)).toEqual(['3/1']);
  });

  test('the total row resolves to every segment of its quarter', async ({ page }) => {
    await tabIntoBarChart(page);
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q1, Sales is 120, Region is North');
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q2, Sales is 135, Region is North');
    await page.keyboard.press('ArrowUp');
    await waitForText(page, 'Region is South');
    await page.keyboard.press('ArrowUp');
    await waitForText(page, 'Region is West');

    await page.keyboard.press('ArrowUp');

    await waitForText(page, 'Quarter is Q2, Sales is 340, Region is Sum');
    await expect(selection(page)).toHaveText(
      'selectionManager.select([Quarter=Q2, Region=North, measure Sum(Orders.Sales)'
      + ' | Quarter=Q2, Region=South, measure Sum(Orders.Sales)'
      + ' | Quarter=Q2, Region=West, measure Sum(Orders.Sales)])',
    );
    expect(await outlinedBars(page)).toEqual(['1/0', '1/1', '1/2']);

    // Q3's total leaves out the blank South cell: there is no mark to select.
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q3, Sales is 275, Region is Sum');
    await expect(selection(page)).toHaveText(
      'selectionManager.select([Quarter=Q3, Region=North, measure Sum(Orders.Sales)'
      + ' | Quarter=Q3, Region=West, measure Sum(Orders.Sales)])',
    );
    expect(await outlinedBars(page)).toEqual(['2/0', '2/2']);
  });

  test('leaving the figure with Tab sends null and clears the selection', async ({ page }) => {
    await tabIntoBarChart(page);
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q1, Sales is 120, Region is North');
    await expect(selection(page)).toContainText('selectionManager.select(');

    await page.keyboard.press('Tab');

    await expect(page.locator('#slicer')).toBeFocused();
    await expect(selection(page)).toHaveText('Nothing selected (selectionManager.clear()).');
    expect(await outlinedBars(page)).toEqual([]);
    await expect(page.locator('#visual')).not.toHaveClass(/dimmed/);
  });

  test('tabbing through without moving sends nothing', async ({ page }) => {
    await tabIntoBarChart(page);

    await page.keyboard.press('Tab');

    await expect(page.locator('#slicer')).toBeFocused();
    await page.waitForTimeout(300); // settle: silence cannot be polled
    await expect(selection(page)).toHaveText('Nothing selected.');
  });

  test('a slicer applied while the reader is inside changes what is announced, in place', async ({ page }) => {
    await tabIntoBarChart(page);
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q1, Sales is 120, Region is North');
    await page.keyboard.press('ArrowUp');
    await waitForText(page, 'Quarter is Q1, Sales is 90, Region is South');

    // In a report the slicer is another visual: the custom visual's frame
    // keeps its focused element. A scripted click stands in for that, so
    // focus stays on MAIDR's figure here too.
    await page.evaluate(() => document.getElementById('slicer')?.click());
    await expect(page.locator('#slicer')).toHaveText('Slicer: show all regions');
    await expect(page.locator('[data-maidr-powerbi] [role="application"]')).toBeFocused();

    // One region left is a plain bar chart rather than a dodged one. The
    // layer's type changed, so there is no position to keep: the reader's
    // next arrow starts over at the first bar, in the new data.
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q1, Sales is 120');
    expect(await text(page)).not.toContain('Region is');
    await expect(selection(page)).toHaveText('selectionManager.select([Quarter=Q1, Region=North, measure Sum(Orders.Sales)])');

    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q2, Sales is 135');
    expect(await text(page)).not.toContain('Region is');
    await expect(selection(page)).toHaveText('selectionManager.select([Quarter=Q2, Region=North, measure Sum(Orders.Sales)])');
    expect(await outlinedBars(page)).toEqual(['1/0']);

    // And back: all three regions again, South included.
    await page.evaluate(() => document.getElementById('slicer')?.click());
    await expect(page.locator('#slicer')).toHaveText('Slicer: show North only');
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q1, Sales is 120, Region is North');
    await page.keyboard.press('ArrowUp');
    await waitForText(page, 'Quarter is Q1, Sales is 90, Region is South');
    expect(await outlinedBars(page)).toEqual(['0/1']);
  });

  test('clicking a bar moves MAIDR\'s cursor to it', async ({ page }) => {
    await page.goto('examples/powerbi-bar.html');

    // From outside: the click focuses the figure and lands on the bar.
    await bar(page, 2, 2).click();
    await waitForText(page, 'Quarter is Q3, Sales is 125, Region is West');
    await expect(page.locator('[data-maidr-powerbi] [role="application"]')).toBeFocused();
    await expect(selection(page)).toContainText('Quarter=Q3, Region=West');
    expect(await outlinedBars(page)).toEqual(['2/2']);

    // Navigation continues from the clicked bar.
    await page.keyboard.press('ArrowDown');
    await waitForText(page, 'Quarter is Q3, Sales is missing, Region is South');

    // From inside: the cursor moves at once.
    await bar(page, 0, 1).click();
    await waitForText(page, 'Quarter is Q1, Sales is 90, Region is South');
    await expect(selection(page)).toContainText('Quarter=Q1, Region=South');
    expect(await outlinedBars(page)).toEqual(['0/1']);

    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q2, Sales is 110, Region is South');
  });
});

test.describe('Power BI adapter: companion mode (powerbi-line.html)', () => {
  /** Tab to the companion's entry point and wait for MAIDR's instruction. */
  async function tabIntoCompanion(page: Page): Promise<void> {
    await page.goto('examples/powerbi-line.html');
    await page.keyboard.press('Tab');
    await expect(page.locator('#companion [role="application"]')).toBeFocused();
    await waitForText(page, 'maidr plot of type: multiline with 2 groups');
  }

  test('renders only a keyboard entry point, with the label as its visible text', async ({ page }) => {
    await tabIntoCompanion(page);

    const anchor = page.locator('#companion [data-maidr-powerbi-anchor]');
    await expect(anchor).toHaveText('Visits and sign-ups by month (accessible chart)');
    await expect(page.locator('#companion svg')).toHaveCount(0);
    // Screen readers hear MAIDR's instruction, not the label.
    await expect(page.locator('#companion [role="application"]')).toHaveAttribute('aria-label', /maidr plot of type: multiline/);
    expect(await nativeHighlights(page)).toEqual([]);
  });

  test('arrows move along the dates and cross-highlight the native chart\'s point', async ({ page }) => {
    await tabIntoCompanion(page);

    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Month is 2025-01-01, Y is 1200, Group is Visits');
    expect(await nativeHighlights(page)).toEqual(['0/0']);

    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Month is 2025-02-01, Y is 1350, Group is Visits');
    expect(await nativeHighlights(page)).toEqual(['1/0']);

    await page.keyboard.press('ArrowLeft');
    await waitForText(page, 'Month is 2025-01-01, Y is 1200, Group is Visits');
    expect(await nativeHighlights(page)).toEqual(['0/0']);
  });

  test('up and down switch between the two lines', async ({ page }) => {
    await tabIntoCompanion(page);
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Month is 2025-01-01');
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Month is 2025-02-01, Y is 1350, Group is Visits');

    await page.keyboard.press('ArrowDown');
    await waitForText(page, 'Month is 2025-02-01, Y is 95, Group is Sign-ups');
    expect(await nativeHighlights(page)).toEqual(['1/1']);

    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Month is 2025-03-01, Y is 90, Group is Sign-ups');
    expect(await nativeHighlights(page)).toEqual(['2/1']);

    await page.keyboard.press('ArrowUp');
    await waitForText(page, 'Month is 2025-03-01, Y is 1280, Group is Visits');
    expect(await nativeHighlights(page)).toEqual(['2/0']);
  });

  test('the blank month is announced as missing and highlights nothing', async ({ page }) => {
    await tabIntoCompanion(page);
    for (const month of ['01', '02', '03']) {
      await page.keyboard.press('ArrowRight');
      await waitForText(page, `Month is 2025-${month}-01`);
    }

    await page.keyboard.press('ArrowRight');

    await waitForText(page, 'Month is 2025-04-01, Y is missing, Group is Visits');
    expect(await nativeHighlights(page)).toEqual([]);

    // Sign-ups has an April reading; the gap is Visits' alone.
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Month is 2025-05-01, Y is 1620, Group is Visits');
    await page.keyboard.press('ArrowDown');
    await waitForText(page, 'Month is 2025-05-01, Y is 130, Group is Sign-ups');
    await page.keyboard.press('ArrowLeft');
    await waitForText(page, 'Month is 2025-04-01, Y is 110, Group is Sign-ups');
    expect(await nativeHighlights(page)).toEqual(['3/1']);
  });

  test('leaving the companion clears the native chart\'s highlight', async ({ page }) => {
    await tabIntoCompanion(page);
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Month is 2025-01-01, Y is 1200, Group is Visits');
    expect(await nativeHighlights(page)).toEqual(['0/0']);

    await page.keyboard.press('Shift+Tab');

    await expect.poll(() => page.evaluate(() => document.getElementById('companion')?.contains(document.activeElement))).toBe(false);
    await expect.poll(() => nativeHighlights(page)).toEqual([]);
  });
});
