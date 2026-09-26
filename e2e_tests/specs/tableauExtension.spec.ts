import type { FrameLocator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * The Tableau dashboard extension, as a browser sees it: MAIDR inside an
 * `<iframe>` on a page that has focusable content on either side of it.
 *
 * A Tableau dashboard holds every extension zone in an iframe, and the reader
 * has to be able to get into it, use it, and get out again with nothing but
 * the keyboard. What this spec establishes is the *browser's* half of that:
 * that the frame is in the page's sequential focus order, that MAIDR's entry
 * point is the first thing focus lands on inside it, that the keys MAIDR
 * handles are handled inside the frame and never reach the page around it, and
 * that MAIDR's live text updates inside the frame.
 *
 * What it cannot establish is Tableau's half. The dashboard here is a stand-in,
 * so whether Tableau's own dashboard puts its extension zones in the tab order,
 * whether its key handlers see a key before the zone does, and whether NVDA,
 * JAWS or VoiceOver announce a live region inside a zone while reading the
 * dashboard, are all still questions for testing on Tableau itself (#934).
 *
 * Requires a built bundle (dist/maidr.js, dist/tableau.js), like every spec.
 */

const DASHBOARD = 'e2e_tests/fixtures/tableau-extension/dashboard.html';

/** The extension zone's frame. */
function zone(page: Page): FrameLocator {
  return page.frameLocator('#zone');
}

/**
 * Open the dashboard and wait for the extension to bind.
 *
 * @param page - The page.
 */
async function openDashboard(page: Page): Promise<void> {
  await page.goto(DASHBOARD);
  await expect(zone(page).locator('body')).toHaveAttribute('data-bound', 'yes');
}

/**
 * Tab from the content before the zone into MAIDR, and wait for the focus-in
 * instruction: an arrow pressed before it lands is pressed before the
 * controller exists.
 *
 * @param page - The page.
 */
async function tabIntoFigure(page: Page): Promise<void> {
  await page.focus('#before');
  await page.keyboard.press('Tab');
  await expect(zone(page).locator('[data-maidr-tableau]')).toContainText('maidr plot');
}

/**
 * Count keydowns that reach the dashboard page itself, outside the frame.
 *
 * @param page - The page.
 */
async function countHostKeys(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { hostKeys: string[] }).hostKeys = [];
    window.addEventListener('keydown', (event) => {
      (window as unknown as { hostKeys: string[] }).hostKeys.push(event.key);
    });
  });
}

test.describe('Tableau dashboard extension in its zone', () => {
  test('binds the dashboard\'s worksheet inside the frame', async ({ page }) => {
    await openDashboard(page);

    await expect(zone(page).locator('[data-maidr-tableau]')).toHaveCount(1);
  });

  test('Tab from the content before the zone lands on MAIDR\'s entry point', async ({ page }) => {
    await openDashboard(page);
    await page.focus('#before');

    await page.keyboard.press('Tab');

    const focused = zone(page).locator('[data-maidr-tableau] :focus, [data-maidr-tableau]:focus');
    await expect(focused).toHaveCount(1);
  });

  test('arrow keys are handled inside the zone, and never reach the dashboard', async ({ page }) => {
    await openDashboard(page);
    await tabIntoFigure(page);
    // Counted from here: the Tab that moved focus in was pressed on the page.
    await countHostKeys(page);

    await page.keyboard.press('ArrowRight');
    await expect(zone(page).locator('[data-maidr-tableau]')).toContainText('Region is East');
    await page.keyboard.press('ArrowRight');
    await expect(zone(page).locator('[data-maidr-tableau]')).toContainText('Region is North');

    const hostKeys = await page.evaluate(
      () => (window as unknown as { hostKeys: string[] }).hostKeys,
    );
    expect(hostKeys).toEqual([]);
  });

  test('announces through a live region inside the zone', async ({ page }) => {
    await openDashboard(page);
    await tabIntoFigure(page);

    await page.keyboard.press('ArrowRight');

    // `role="alert"` is an implicitly assertive live region.
    const live = zone(page).locator('[data-maidr-tableau] [role="alert"]');
    await expect(live.filter({ hasText: 'Region is East, Sales is 10' })).toHaveCount(1);
  });

  test('mirrors the cursor into Tableau as a mark selection', async ({ page }) => {
    await openDashboard(page);
    await tabIntoFigure(page);

    await page.keyboard.press('ArrowRight');

    await expect.poll(async () => page.frame({ url: /extension\.html$/ })?.evaluate(
      () => (window as unknown as { selections: unknown[] }).selections.length,
    )).toBeGreaterThan(0);
  });

  test('does not trap focus: Tab leaves the zone for the content after it', async ({ page }) => {
    await openDashboard(page);
    await page.focus('#before');
    await page.keyboard.press('Tab');

    // Out of the figure, then out of the frame. MAIDR's own controls may sit
    // between, so keep going until focus is back on the dashboard, and fail
    // if it never gets there.
    for (let press = 0; press < 20; press++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.id) === 'after') {
        break;
      }
    }

    expect(await page.evaluate(() => document.activeElement?.id)).toBe('after');
  });
});
