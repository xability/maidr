import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * E2E coverage for the Office adapter (`dist/office.js`): PowerPoint and Word
 * task panes, driven through examples/office-taskpane.html with real
 * keypresses.
 *
 * The page writes a small presentation -- a clustered column chart with a
 * blank cell, a waterfall with two points set as totals, and a pie of pie with
 * a custom split on a hidden slide -- installs a fake Office.js that hands it
 * over as PowerPoint does, and binds MAIDR with `bindOffice`. `?host=Word`
 * makes it a Word document of two charts instead. Its buttons stand for what
 * a user does outside the pane: selecting a chart, editing one.
 *
 * What it cannot check is the applications' half: whether F6 reaches the task
 * pane, and whether a screen reader in PowerPoint or Word announces it. See
 * docs/office.md.
 *
 * Requires a built bundle (dist/maidr.js, dist/office.js), like every spec.
 */

const PAGE = 'examples/office-taskpane.html';

/** Polls until MAIDR's text region contains `expected`. */
async function waitForText(page: Page, expected: string): Promise<void> {
  await page.waitForFunction(
    needle => (document.querySelector('[id^="react-container"]')?.textContent ?? '').includes(needle),
    expected,
    { timeout: 5000 },
  );
}

/** The task pane's chart picker, found by its label. */
function picker(page: Page): Locator {
  return page.locator('#taskpane').getByLabel('Chart');
}

/** MAIDR's plot element, whichever role it has at the moment. */
function plot(page: Page): Locator {
  return page.locator('#taskpane [data-maidr-office-view] [tabindex="0"]').first();
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

test.describe('Office adapter: the PowerPoint task pane (office-taskpane.html)', () => {
  test('offers every chart by slide, and reads the first', async ({ page }) => {
    await open(page);

    await expect(picker(page).locator('option')).toHaveText([
      'Slide 1: Sales by quarter',
      'Slide 2: Cash flow',
      'Slide 3 (hidden): Spending',
    ]);
    await expect(page.locator('#taskpane [data-maidr-office-progress]')).toHaveText('Charts read: 3.');
    await tabIntoFigure(page, 'maidr plot of type: vertical dodged_bar');

    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Quarter is Q1, Sales ($) is 120, Level is North');
    for (const quarter of ['Q2', 'Q3']) {
      await page.keyboard.press('ArrowRight');
      await waitForText(page, `Quarter is ${quarter}, Sales ($)`);
    }
    await page.keyboard.press('ArrowUp');
    await waitForText(page, 'Quarter is Q3, Sales ($) is missing, Level is South');
  });

  test('reads a waterfall\'s totals from the file, which Office.js could not report', async ({ page }) => {
    await open(page);
    await picker(page).selectOption({ label: 'Slide 2: Cash flow' });
    await tabIntoFigure(page, 'maidr plot of type: waterfall');

    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'Start, total Cash is 100, Running total is 100');
    for (const step of ['Sales, increase', 'Costs, decrease']) {
      await page.keyboard.press('ArrowRight');
      await waitForText(page, step);
    }
    await page.keyboard.press('ArrowRight');
    await waitForText(page, 'End, total Cash is 120, Running total is 120');
  });

  test('reads a pie of pie split by hand as its two plots', async ({ page }) => {
    await open(page);
    await picker(page).selectOption({ label: 'Slide 3 (hidden): Spending' });
    await tabIntoFigure(page, 'maidr figure containing 2 subplots');

    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');

    await waitForText(page, 'Rent, Spending is 50, Percentage is 50.0%');
  });

  test('shows the chart selected on a slide', async ({ page }) => {
    await open(page);

    await page.locator('#select-cash').click();

    await expect(picker(page)).toHaveValue('257:4');
    await expect(plot(page)).toHaveAttribute('aria-label', /maidr plot of type: waterfall/);
  });

  test('keeps the chart on show when what is selected is not a chart', async ({ page }) => {
    await open(page);

    await page.locator('#select-title').click();

    await expect(picker(page)).toHaveValue('256:4');
  });

  test('reads an edited chart again on Read again', async ({ page }) => {
    await open(page);
    await page.locator('#edit-sales').click();

    await page.locator('#taskpane').getByRole('button', { name: 'Read again' }).click();
    await expect(page.locator('#taskpane [data-maidr-office-progress]')).toHaveText('Charts read: 3.');
    await tabIntoFigure(page, 'maidr plot of type: vertical dodged_bar');
    await page.keyboard.press('ArrowRight');

    await waitForText(page, 'Quarter is Q1, Sales ($) is 125, Level is North');
  });
});

test.describe('Office adapter: the Word task pane (office-taskpane.html?host=Word)', () => {
  test('offers every chart in reading order, and writes dates as the chart does', async ({ page }) => {
    await open(page, '?host=Word');
    await expect(picker(page).locator('option')).toHaveText(['Chart 1: Sales by quarter', 'Chart 2: Visitors']);

    await page.locator('#select-visitors').click();
    await expect(picker(page)).toHaveValue('2');
    await tabIntoFigure(page, 'maidr plot of type: single line');
    await page.keyboard.press('ArrowRight');

    await waitForText(page, 'Jan-24, People is 1200');
  });

  test('reads the chart selected as it is now, edits included', async ({ page }) => {
    await open(page, '?host=Word');

    await page.locator('#edit-sales').click();
    await expect(picker(page)).toHaveValue('1');
    await tabIntoFigure(page, 'maidr plot of type: vertical dodged_bar');
    await page.keyboard.press('ArrowRight');

    await waitForText(page, 'Quarter is Q1, Sales ($) is 125, Level is North');
  });
});
