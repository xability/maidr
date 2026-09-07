import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { MultiLayerPlotPage } from '../page-objects/plots/multiLayer-page';

/**
 * The chart description's layer tab strip, on a real multi-layer chart.
 *
 * `d` used to describe whichever layer the reader happened to be on, without
 * saying the others existed. What matters here — and what only a browser can
 * answer — is that confirming a tab is a real move: it switches the layer in
 * the chart itself, so leaving the dialog returns the reader to the layer they
 * were last reading about rather than the one they opened it from.
 */

/** Loads the bar + line multilayer example and focuses the chart. */
async function setupMultiLayerPage(page: Page): Promise<void> {
  const multiLayerPlotPage = new MultiLayerPlotPage(page);
  await multiLayerPlotPage.navigateToMultiLayerPlot();
  await multiLayerPlotPage.activateMaidr();
}

/** The description dialog, resolved by role rather than by CSS. */
function dialogOf(page: Page): ReturnType<Page['getByRole']> {
  return page.getByRole('dialog', { name: 'Chart Description', exact: true });
}

test.describe('chart description layer tabs', () => {
  test.beforeEach(async ({ page }) => {
    await setupMultiLayerPage(page);
  });

  test('names every layer and says which one is being described', async ({ page }) => {
    await page.keyboard.press('d');
    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();

    await expect(dialog.getByRole('tab')).toHaveText(['Bar Chart', 'Line Chart']);
    await expect(dialog.getByText('Showing layer 1 of 2: Bar Chart')).toBeVisible();
    await expect(dialog.getByText('Chart Type: Bar Chart')).toBeVisible();
  });

  test('opens on the current layer, with the keyboard already on its tab', async ({ page }) => {
    await page.keyboard.press('d');
    const dialog = dialogOf(page);

    const tabs = dialog.getByRole('tab');
    await expect(tabs.first()).toBeFocused();
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  });

  test('arrowing along the strip moves the cursor and nothing else', async ({ page }) => {
    // Manual activation. Passing over a layer on the way to another must not
    // relocate the reader in the chart behind the dialog.
    await page.keyboard.press('d');
    const dialog = dialogOf(page);

    await page.keyboard.press('ArrowRight');

    const tabs = dialog.getByRole('tab');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'false');
    await expect(dialog.getByText('Chart Type: Bar Chart')).toBeVisible();
  });

  test('space confirms the tab and re-describes the chart against that layer', async ({ page }) => {
    await page.keyboard.press('d');
    const dialog = dialogOf(page);

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');

    await expect(dialog.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByText('Showing layer 2 of 2: Line Chart')).toBeVisible();
    await expect(dialog.getByText('Chart Type: Line Chart')).toBeVisible();
  });

  test('escape returns the reader to the layer they were last reading about', async ({ page }) => {
    // The point of the whole feature: the switch reaches the model, so leaving
    // the dialog lands on that layer rather than back on the first.
    await page.keyboard.press('d');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await page.keyboard.press('Escape');

    await expect(dialogOf(page)).toBeHidden();

    await page.keyboard.press('d');

    await expect(dialogOf(page).getByText('Showing layer 2 of 2: Line Chart')).toBeVisible();
  });

  test('the strip stops at the ends rather than wrapping past them', async ({ page }) => {
    await page.keyboard.press('d');
    const dialog = dialogOf(page);

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    await expect(dialog.getByRole('tab').nth(1)).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');

    await expect(dialog.getByRole('tab').first()).toBeFocused();
  });
});
