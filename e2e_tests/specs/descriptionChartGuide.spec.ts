import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';

/**
 * The description dialog's "About this chart type" guide, on a real chart.
 *
 * What only a browser can answer: that the disclosure is reached and worked
 * from the keyboard the way a screen reader user would, that it shows nothing
 * until it is opened, and that it sits beside the rest of the dialog without
 * shadowing the "Chart Type" line or deepening the heading outline.
 */

/** Loads the bar plot example, focuses the chart and opens the description. */
async function openDescription(page: Page): Promise<ReturnType<Page['getByRole']>> {
  const barPlotPage = new BarPlotPage(page);
  await barPlotPage.navigateToBarPlot();
  await barPlotPage.activateMaidr();
  await page.keyboard.press('d');
  const dialog = page.getByRole('dialog', { name: 'Chart Description', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('chart type guide in the description dialog', () => {
  test('starts collapsed and opens and closes from the keyboard', async ({ page }) => {
    const dialog = await openDescription(page);
    const toggle = dialog.getByRole('button', { name: 'About this chart type (Bar Chart)' });
    const definition = dialog.getByText('A bar chart shows one number for each category as a bar.');

    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(definition).toBeHidden();

    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(definition).toBeVisible();
    await expect(dialog.getByRole('term')).toHaveText(['What it is', 'What it is used for', 'What it looks like']);

    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(definition).toBeHidden();
    // Still inside the dialog: the disclosure's keys are its own.
    await expect(dialog).toBeVisible();
  });

  test('is a heading at the level of the dialog\'s other sections', async ({ page }) => {
    const dialog = await openDescription(page);

    await expect(dialog.getByRole('heading', { name: 'About this chart type (Bar Chart)', level: 3 })).toBeVisible();
    await expect(dialog.getByText('Chart Type: Bar Chart')).toHaveCount(1);
  });
});
