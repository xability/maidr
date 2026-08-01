import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';
import { TestConstants } from '../utils/constants';
import { modifierKey } from '../utils/platform';

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

/**
 * Reports how the open dialog is named and what its heading outline looks
 * like.
 *
 * Resolved through the DOM the way assistive technology resolves it, rather
 * than by asserting on the markup that produces it: `idCarriers` counts the
 * elements actually claiming the referenced id, so a dangling reference (0) or
 * a duplicated one (2+) fails here even when the name still computes
 * correctly. `nestedHeadings` catches a heading rendered inside another —
 * invalid, and the reason a title can land in the outline twice (#665).
 * @param page - The Playwright page
 * @returns The dialog's labelling and heading structure
 * @throws If no dialog is open
 */
async function dialogStructure(page: Page): Promise<{
  idCarriers: number;
  nestedHeadings: string[];
  headings: string[];
}> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) {
      throw new Error('no dialog is open');
    }
    const labelledBy = dialog.getAttribute('aria-labelledby');
    const headings = [...dialog.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    return {
      idCarriers: labelledBy
        ? document.querySelectorAll(`[id="${CSS.escape(labelledBy)}"]`).length
        : 0,
      nestedHeadings: headings
        .filter((h) => {
          // Scoped to the dialog. `closest` walks the whole ancestor chain, and
          // MAIDR renders into host pages it does not control, so an unscoped
          // match could report a nesting that belongs to the host's markup
          // rather than to anything this asserts on.
          const ancestor = h.parentElement?.closest('h1,h2,h3,h4,h5,h6');
          return ancestor ? dialog.contains(ancestor) : false;
        })
        .map(h => h.tagName),
      headings: headings.map(h => `${h.tagName}:${h.textContent?.trim()}`),
    };
  });
}

test.describe('dialog accessibility tree', () => {
  test('help dialog and its controls resolve by role', async ({ page }) => {
    const barPlotPage = await setupBarPlotPage(page);
    await barPlotPage.openHelpMenu();

    await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts', exact: true })).toBeVisible();
    expect(await hiddenAncestorsOf(page, '.MuiDialog-root')).toEqual([]);
    expect(await wrapperAriaHidden(page)).toBeNull();
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();

    // #665: the title was rendered as a heading inside `DialogTitle`, itself a
    // heading, so it appeared in the outline twice.
    const structure = await dialogStructure(page);
    expect(structure.nestedHeadings).toEqual([]);
    expect(structure.idCarriers).toBe(1);
    expect(structure.headings).toEqual(['H2:Keyboard Shortcuts']);
  });

  test('settings dialog and its controls resolve by role', async ({ page }) => {
    const barPlotPage = await setupBarPlotPage(page);
    await barPlotPage.openSettingsMenu();

    // By name, not by role alone (#663): the dialog used to resolve here with
    // no accessible name, indistinguishable from the four other dialogs.
    await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
    expect(await hiddenAncestorsOf(page, '.settings-dialog')).toEqual([]);
    expect(await wrapperAriaHidden(page)).toBeNull();

    await expect(page.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset Settings' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Close Settings with no changes' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save & Close Settings' })).toBeVisible();

    // Fixed in #664 and the shape #665 moved the other dialogs onto — asserted
    // here so the two cannot drift apart.
    const structure = await dialogStructure(page);
    expect(structure.nestedHeadings).toEqual([]);
    expect(structure.idCarriers).toBe(1);
    expect(structure.headings[0]).toBe('H2:Settings');
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

    await expect(page.getByRole('dialog', { name: 'Chart Description', exact: true })).toBeVisible();
    expect(await hiddenAncestorsOf(page, '.MuiDialog-root')).toEqual([]);
    expect(await wrapperAriaHidden(page)).toBeNull();

    // #665: this dialog put the same id on `DialogTitle` and on a `Typography`
    // inside it, so two elements claimed the id the dialog points at, and the
    // title appeared in the outline twice.
    const structure = await dialogStructure(page);
    expect(structure.nestedHeadings).toEqual([]);
    expect(structure.idCarriers).toBe(1);
    expect(structure.headings.filter(h => h.endsWith(':Chart Description'))).toHaveLength(1);
    // The title outranks the sections it introduces, rather than sitting at
    // the same level or skipping straight past them.
    expect(structure.headings[0]).toBe('H2:Chart Description');
    expect(structure.headings.slice(1).every(h => h.startsWith('H3:'))).toBe(true);
  });

  test('command palette resolves by role', async ({ page }) => {
    await setupBarPlotPage(page);
    // The binding is `Platform.ctrl + shift + p`, which is Command on macOS.
    await page.keyboard.press(`${await modifierKey(page)}+Shift+P`);

    await expect(page.getByRole('dialog', { name: 'Command Palette', exact: true })).toBeVisible();
    expect(await hiddenAncestorsOf(page, '.MuiDialog-root')).toEqual([]);
    expect(await wrapperAriaHidden(page)).toBeNull();
    await expect(page.getByRole('heading', { name: 'Command Palette' })).toBeVisible();

    // Already correct before #665 — asserted so it stays that way.
    const structure = await dialogStructure(page);
    expect(structure.nestedHeadings).toEqual([]);
    expect(structure.idCarriers).toBe(1);
  });

  test('chat dialog resolves by role', async ({ page }) => {
    await setupBarPlotPage(page);
    await page.keyboard.press('Shift+/');

    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await hiddenAncestorsOf(page, '.MuiDialog-root')).toEqual([]);
    expect(await wrapperAriaHidden(page)).toBeNull();

    // #665: the dialog was named after the `DialogTitle` row, which holds the
    // close button as well as the title — so the name ended
    // "…AI Chat Interface Close chat dialog". Naming it after the heading
    // alone is what keeps the button's label out.
    //
    // `exact` matters here and is not decoration: Playwright matches `name` as
    // a substring by default, so without it this passes against the polluted
    // name it is written to reject.
    //
    // This is also the only assertion anywhere that covers the concatenation.
    // `test/ui/dialogTitles.test.tsx` checks the same dialog's structure, but
    // cannot check its name: jsdom does not fold a descendant button's
    // `aria-label` into the row's computed name, so the polluted name never
    // appears there. The jsdom suite is not a superset of this one.
    await expect(
      page.getByRole('dialog', { name: 'Chart Assistant - AI Chat Interface', exact: true }),
    ).toBeVisible();

    const structure = await dialogStructure(page);
    expect(structure.nestedHeadings).toEqual([]);
    expect(structure.idCarriers).toBe(1);
    expect(structure.headings.filter(h => h.endsWith(':Chart Assistant'))).toHaveLength(1);
  });

  test('the chart stays in the accessibility tree while a dialog is open', async ({ page }) => {
    const barPlotPage = await setupBarPlotPage(page);
    await barPlotPage.openHelpMenu();

    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await hiddenAncestorsOf(page, `figure#maidr-figure-${TestConstants.BAR_ID}`)).toEqual([]);
  });
});
