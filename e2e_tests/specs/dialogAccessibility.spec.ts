import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';
import { TestConstants } from '../utils/constants';

/**
 * Every MAIDR dialog is rendered with `disablePortal`, so it lives inside the
 * host page's chart wrapper rather than beside it. MUI's `ModalManager` marks
 * the modal container's other children `aria-hidden="true"` when a modal
 * opens; with the default container (`document.body`) the element it hid was
 * an *ancestor* of the dialog, so the dialog hid itself along with the chart
 * it was opened from.
 *
 * These assertions are deliberately role-based. The other specs reach the
 * dialogs through CSS selectors, which resolve fine inside an `aria-hidden`
 * subtree — which is why the defect went unnoticed. Querying by role fails the
 * moment the dialog leaves the accessibility tree again.
 */

/**
 * Loads the bar plot example and focuses the chart.
 * @param page - The Playwright page
 * @returns The initialised page object
 */
async function setupBarPlotPage(page: Page): Promise<BarPlotPage> {
  const barPlotPage = new BarPlotPage(page);
  await barPlotPage.navigateToBarPlot();
  await barPlotPage.activateMaidr();
  return barPlotPage;
}

/**
 * Collects every ancestor of an element that is marked `aria-hidden="true"`.
 * A non-empty result means the element is outside the accessibility tree.
 * @param page - The Playwright page
 * @param selector - CSS selector for the element to walk up from
 * @returns Tag names (with ids where present) of the hidden ancestors
 */
async function hiddenAncestorsOf(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((target) => {
    const element = document.querySelector(target);
    if (!element) {
      return [`no element matched "${target}"`];
    }
    const hidden: string[] = [];
    for (let node = element.parentElement; node; node = node.parentElement) {
      if (node.getAttribute('aria-hidden') === 'true') {
        hidden.push(node.id ? `${node.tagName.toLowerCase()}#${node.id}` : node.tagName.toLowerCase());
      }
    }
    return hidden;
  }, selector);
}

/**
 * Reads `aria-hidden` off the wrapper MAIDR renders into — the body-level
 * ancestor of the chart that MUI used to hide.
 *
 * Resolved by walking up from the chart article rather than by taking
 * `body.firstElementChild`, so a change to the example's markup order throws
 * here instead of silently reading some other element — which, since the
 * assertion is `toBeNull()`, would otherwise pass while checking nothing.
 * @param page - The Playwright page
 * @returns The attribute value, or null when it is absent
 * @throws If the chart article is missing or not inside `document.body`
 */
async function wrapperAriaHidden(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const article = document.querySelector('article[id^="maidr-article"]');
    if (!article) {
      throw new Error('no maidr article in the document');
    }
    let wrapper: Element = article;
    while (wrapper.parentElement && wrapper.parentElement !== document.body) {
      wrapper = wrapper.parentElement;
    }
    if (wrapper.parentElement !== document.body) {
      throw new Error('maidr article is not inside document.body');
    }
    return wrapper.getAttribute('aria-hidden');
  });
}

test.describe('dialog accessibility tree', () => {
  test('help dialog and its controls resolve by role', async ({ page }) => {
    const barPlotPage = await setupBarPlotPage(page);
    await barPlotPage.openHelpMenu();

    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await hiddenAncestorsOf(page, '.MuiDialog-root')).toEqual([]);
    expect(await wrapperAriaHidden(page)).toBeNull();
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  });

  test('settings dialog and its controls resolve by role', async ({ page }) => {
    const barPlotPage = await setupBarPlotPage(page);
    await barPlotPage.openSettingsMenu();

    // By name, not by role alone (#663): the dialog used to resolve here with
    // no accessible name, indistinguishable from the four other dialogs.
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    expect(await hiddenAncestorsOf(page, '.settings-dialog')).toEqual([]);
    expect(await wrapperAriaHidden(page)).toBeNull();

    await expect(page.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset Settings' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Close Settings with no changes' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save & Close Settings' })).toBeVisible();
  });

  test('a select menu inside the settings dialog resolves by role', async ({ page }) => {
    const barPlotPage = await setupBarPlotPage(page);
    await barPlotPage.openSettingsMenu();

    // A Select's menu is a modal too, and it is nested deeper still, so it
    // needs the same container scoping the dialog does.
    await page
      .locator('.settings-dialog [role="combobox"]:not([aria-disabled="true"])')
      .first()
      .click();

    await expect(page.getByRole('listbox')).toBeVisible();
    expect(await hiddenAncestorsOf(page, '.MuiMenu-root')).toEqual([]);
    expect(await wrapperAriaHidden(page)).toBeNull();
    expect(await page.getByRole('option').count()).toBeGreaterThan(0);
  });

  // Description, the Command Palette and Chat carry the same wiring as Help
  // and Settings, so each needs its own assertion — the hook is per-component,
  // and a missed `container` on one of them is invisible to the others.
  test('description dialog resolves by role', async ({ page }) => {
    await setupBarPlotPage(page);
    await page.keyboard.press('d');

    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await hiddenAncestorsOf(page, '.MuiDialog-root')).toEqual([]);
    expect(await wrapperAriaHidden(page)).toBeNull();
  });

  test('command palette resolves by role', async ({ page }) => {
    await setupBarPlotPage(page);
    // The binding is `Platform.ctrl + shift + p`, which is Command on macOS.
    await page.keyboard.press(`${TestConstants.COMMAND_KEY}+Shift+P`);

    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await hiddenAncestorsOf(page, '.MuiDialog-root')).toEqual([]);
    expect(await wrapperAriaHidden(page)).toBeNull();
    await expect(page.getByRole('heading', { name: 'Command Palette' })).toBeVisible();
  });

  test('chat dialog resolves by role', async ({ page }) => {
    await setupBarPlotPage(page);
    await page.keyboard.press('Shift+/');

    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await hiddenAncestorsOf(page, '.MuiDialog-root')).toEqual([]);
    expect(await wrapperAriaHidden(page)).toBeNull();
  });

  test('the chart stays in the accessibility tree while a dialog is open', async ({ page }) => {
    const barPlotPage = await setupBarPlotPage(page);
    await barPlotPage.openHelpMenu();

    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await hiddenAncestorsOf(page, `figure#maidr-figure-${TestConstants.BAR_ID}`)).toEqual([]);
  });
});
