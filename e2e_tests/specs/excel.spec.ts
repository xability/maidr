import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * E2E coverage for the Excel adapter (`dist/excel.js`), driven through
 * examples/excel-taskpane.html with real keypresses.
 *
 * The page stands in for an add-in's task pane: it installs a fake Office.js
 * holding a workbook of five charts on four worksheets, binds MAIDR into an
 * element the way a task pane does from `Office.onReady`, and has buttons for
 * what a user does in the grid -- selecting a chart, editing a cell. Like the
 * Power BI spec, this drives the page directly rather than through a page
 * object: what it checks is the binding, not a standard plot fixture.
 *
 * What it cannot check is Excel's half: whether F6 reaches the task pane, and
 * whether a screen reader in Excel announces it. See docs/excel.md.
 *
 * Requires a built bundle (dist/maidr.js, dist/excel.js), like every spec.
 */

const PAGE = 'examples/excel-taskpane.html';

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

/** The task pane's chart picker, found by its label. */
function picker(page: Page): Locator {
  return page.locator('#taskpane').getByLabel('Chart');
}

/** MAIDR's plot element, whichever role it has at the moment. */
function plot(page: Page): Locator {
  return page.locator('#taskpane [data-maidr-excel-view] [tabindex="0"]').first();
}

function status(page: Page): Locator {
  return page.locator('#taskpane [data-maidr-excel-status]');
}

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-bound', 'yes');
}

/** From the picker, Tab into the figure and wait for MAIDR's instruction. */
async function tabIntoFigure(page: Page, instruction: string): Promise<void> {
  await picker(page).focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#taskpane [role="application"]')).toBeFocused();
  await waitForText(page, instruction);
}

test.describe('Excel adapter: the task pane (excel-taskpane.html)', () => {
  test('offers every chart in the workbook in a labelled picker', async ({ page }) => {
    await open(page);

    await expect(picker(page).locator('option')).toHaveText([
      'Sales - Sales by quarter',
      'Web - Website visits',
      'Mix - Market share',
      'Mix - Revenue and margin',
      'Other - Product sizes',
    ]);
    // No chart is active, so the first is shown, inside MAIDR's figure.
    await expect(picker(page)).toHaveValue('{chart-sales}');
    await expect(plot(page)).toHaveAttribute('aria-label', /maidr plot of type: vertical dodged_bar/);
    await expect(plot(page).locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  });

  test('Tab from the picker reaches the chart, and the arrows read it', async ({ page }) => {
    await open(page);
    await tabIntoFigure(page, 'maidr plot of type: vertical dodged_bar');

    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q1, Sales ($) is 120, Level is North');
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q2, Sales ($) is 135, Level is North');
    await page.keyboard.press('ArrowUp');
    await waitForText(page, 'Quarter is Q2, Sales ($) is 110, Level is South');
  });

  test('a blank cell is announced as missing', async ({ page }) => {
    await open(page);
    await tabIntoFigure(page, 'maidr plot of type: vertical dodged_bar');
    for (const quarter of ['Q1', 'Q2', 'Q3']) {
      await page.keyboard.press('ArrowRight');
      await waitForText(page, `Quarter is ${quarter}, Sales ($)`);
    }

    await page.keyboard.press('ArrowUp');

    await waitForText(page, 'Quarter is Q3, Sales ($) is missing, Level is South');
  });

  test('choosing another chart with the arrow keys reads it, named by its header cell', async ({ page }) => {
    await open(page);
    await picker(page).focus();

    await page.keyboard.press('ArrowDown');

    await expect(picker(page)).toHaveValue('{chart-visits}');
    await expect(picker(page)).toBeFocused();
    await expect(plot(page)).toHaveAttribute('aria-label', /maidr plot of type: multiline with 2 groups/);
    await tabIntoFigure(page, 'maidr plot of type: multiline with 2 groups');
    await page.keyboard.press('ArrowRight');
    // The category axis has no title; its header cell, "Month", names it.
    await waitForText(page, 'Month is Jan, People is 1200, Group is Visits');
    await page.keyboard.press('ArrowDown');
    await waitForText(page, 'Month is Jan, People is 80, Group is Sign-ups');
  });

  test('a combo chart reads as a column layer and a line layer, each on its own axis', async ({ page }) => {
    await open(page);
    await picker(page).selectOption('{chart-combo}');
    await expect(plot(page)).toHaveAttribute('aria-label', /containing 2 layers, and this is layer 1 of 2: vertical bar plot/);
    await tabIntoFigure(page, 'maidr plot containing 2 layers');

    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q1, Revenue ($k) is 310');
    await page.keyboard.press('PageUp');
    await waitForText(page, 'Layer 2 of 2: single line plot at Quarter is Q1, Margin (%) is 12');
    await page.keyboard.press('PageDown');
    await waitForText(page, 'Layer 1 of 2: bar plot at Quarter is Q1, Revenue ($k) is 310');
  });

  test('selecting a chart in the workbook shows it in the pane', async ({ page }) => {
    await open(page);

    await page.locator('#activate-share').click();

    await expect(picker(page)).toHaveValue('{chart-share}');
    await expect(plot(page)).toHaveAttribute('aria-label', /maidr plot of type: pie/);
  });

  test('moving out of the chart keeps it in the pane', async ({ page }) => {
    await open(page);
    await page.locator('#activate-visits').click();
    await expect(picker(page)).toHaveValue('{chart-visits}');

    await page.locator('#deactivate').click();
    await picker(page).focus();

    await expect(picker(page)).toHaveValue('{chart-visits}');
    await expect(plot(page)).toHaveAttribute('aria-label', /multiline/);
  });

  test('an edit in the grid is read in place while the reader is in the chart', async ({ page }) => {
    await open(page);
    await tabIntoFigure(page, 'maidr plot of type: vertical dodged_bar');
    for (const quarter of ['Q1', 'Q2', 'Q3']) {
      await page.keyboard.press('ArrowRight');
      await waitForText(page, `Quarter is ${quarter}`);
    }
    await page.keyboard.press('ArrowUp');
    await waitForText(page, 'Quarter is Q3, Sales ($) is missing, Level is South');

    // In Excel the edit happens in the grid while the pane keeps its focused
    // element; a scripted click keeps focus on MAIDR's figure here too.
    await page.evaluate(() => document.getElementById('edit')?.click());
    await expect(page.locator('#taskpane [role="application"]')).toBeFocused();

    // The chart's shape is unchanged, so the reader keeps their place, and
    // Space replays it with the new value once the pane has re-read it.
    await expect.poll(async () => {
      await page.keyboard.press('Space');
      return text(page);
    }, { timeout: 5000 }).toContain('Quarter is Q3, Sales ($) is 105, Level is South');
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q4, Sales ($) is 140, Level is South');
  });

  test('a treemap reads its groups, then each group\'s products, from the category columns', async ({ page }) => {
    await open(page);
    await picker(page).focus();

    await page.keyboard.press('End');

    await expect(picker(page)).toHaveValue('{chart-sizes}');
    await expect(plot(page)).toHaveAttribute('aria-label', /maidr plot of type: treemap/);
    await tabIntoFigure(page, 'maidr plot of type: treemap');
    await page.keyboard.press('ArrowRight');
    // The group cell beside Pears is blank: Fruit, carried down, holds both.
    await waitForText(page, 'Group / Product is Fruit, Sales is 80, Share of total is 80.0%');
    await page.keyboard.press('ArrowDown');
    await waitForText(page, 'Group / Product is Apples, Sales is 50, Share of Fruit is 62.5%');
  });

  test('focus moves to the message when the chart\'s data goes, and back when it returns', async ({ page }) => {
    await open(page);
    await tabIntoFigure(page, 'maidr plot of type: vertical dodged_bar');

    await page.evaluate(() => document.getElementById('clear')?.click());

    await expect(status(page)).toHaveText('This chart has no data to read.');
    await expect(status(page)).toBeFocused();

    await page.evaluate(() => document.getElementById('restore')?.click());

    await expect(page.locator('#taskpane [role="application"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q1, Sales ($) is 120, Level is North');
  });

  test('an Excel without ExcelApi 1.12 is told why nothing is read', async ({ page }) => {
    await open(page, '?api=1.11');

    await expect(status(page)).toHaveText(/^This version of Excel cannot share its charts with add-ins/);
    await expect(page.locator('#taskpane select')).toHaveCount(0);
    await page.locator('#taskpane').getByText(/This version of Excel/).focus();
    await expect(status(page)).toBeFocused();
  });
});
