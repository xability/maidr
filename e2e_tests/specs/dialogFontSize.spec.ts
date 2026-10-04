import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';
import { modifierKey } from '../utils/platform';

/**
 * MAIDR's dialogs size their text in rem, through MUI's typography, and MUI
 * assumes a 16px root. Bootstrap 3 sets `html { font-size: 10px }`, and with
 * it every R Markdown `html_document`, bookdown gitbook and flexdashboard page
 * a chart is embedded in: until MAIDR told MUI how the page's root compares
 * with the reader's default font size, every dialog's text there came out at
 * 62.5% -- 8.75px body text, for readers who include people with low vision.
 *
 * Each case reads every piece of text in an open dialog under two root font
 * sizes, and nothing else different, so text anywhere in a dialog that still
 * follows a shrunken root fails here, whatever component or style sizes it.
 */

/** Opens a dialog on an activated chart. */
type DialogOpener = (page: Page, barPlotPage: BarPlotPage) => Promise<void>;

const DIALOGS: ReadonlyArray<readonly [string, DialogOpener]> = [
  ['help', (_page, barPlotPage) => barPlotPage.openHelpMenu()],
  ['settings', (_page, barPlotPage) => barPlotPage.openSettingsMenu()],
  ['description', page => page.keyboard.press('d')],
  // The binding is `Platform.ctrl + shift + p`, which is Command on macOS.
  ['command palette', async page => page.keyboard.press(`${await modifierKey(page)}+Shift+P`)],
];

/**
 * Opens a dialog on the bar plot example.
 * @param page - The Playwright page
 * @param open - Opens the dialog
 * @param css - A stylesheet to add to the page before the chart is activated,
 * or nothing to leave the page as it is
 */
async function openDialog(page: Page, open: DialogOpener, css?: string): Promise<void> {
  const barPlotPage = new BarPlotPage(page);
  await barPlotPage.navigateToBarPlot();
  if (css) {
    await page.addStyleTag({ content: css });
  }
  await barPlotPage.activateMaidr();
  await open(page, barPlotPage);
  await expect(page.getByRole('dialog')).toBeVisible();
}

/**
 * Reads the computed font size of every element in the open dialog that
 * carries text of its own, in document order.
 * @param page - The Playwright page
 * @returns One `"text: size"` entry per element, so a failure names the text
 * whose size moved
 */
async function openDialogTextSizes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) {
      throw new Error('no dialog is open');
    }
    return [...dialog.querySelectorAll('*')].flatMap((element) => {
      const text = [...element.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent?.trim() ?? '')
        .join(' ')
        .trim();
      return text ? [`${text.slice(0, 40)}: ${getComputedStyle(element).fontSize}`] : [];
    });
  });
}

/**
 * Opens a dialog on the bar plot example and reads its text sizes.
 * @param page - The Playwright page
 * @param open - Opens the dialog to measure
 * @param rootFontSize - A CSS font size for the page's root element, or
 * nothing to leave the root alone
 * @returns The entries {@link openDialogTextSizes} reads
 */
async function dialogTextSizes(
  page: Page,
  open: DialogOpener,
  rootFontSize?: string,
): Promise<string[]> {
  await openDialog(page, open, rootFontSize && `html { font-size: ${rootFontSize}; }`);
  return openDialogTextSizes(page);
}

/**
 * Reads the size, in px, out of each `"text: size"` entry.
 * @param entries - Entries from {@link dialogTextSizes}
 * @returns The sizes, in the same order
 */
function pixels(entries: string[]): number[] {
  return entries.map(entry => Number.parseFloat(entry.slice(entry.lastIndexOf(':') + 1)));
}

test.describe('dialog text on a page that sets its own root font size', () => {
  for (const [name, open] of DIALOGS) {
    test(`keeps the ${name} dialog's text at its usual size under a 10px root`, async ({ page }) => {
      const usual = await dialogTextSizes(page, open);
      const underSmallRoot = await dialogTextSizes(page, open, '10px');

      expect(usual.length).toBeGreaterThan(0);
      expect(underSmallRoot).toEqual(usual);
    });
  }

  test('still enlarges dialog text under a root the page enlarged', async ({ page }) => {
    const open = DIALOGS[0][1];

    const usual = pixels(await dialogTextSizes(page, open));
    const underLargeRoot = pixels(await dialogTextSizes(page, open, '20px'));

    expect(usual.length).toBeGreaterThan(0);
    expect(underLargeRoot).toEqual(usual.map(size => size * 1.25));
  });

  test('follows a root the page moves while the dialog is open', async ({ page }) => {
    // A responsive page sets its root in a media query, and a reader who
    // resizes the window -- or zooms, which narrows it -- crosses the
    // breakpoint with a dialog open. Opened under a 16px root and moved to a
    // 10px one, the dialog would otherwise keep sizing for 16px and shrink.
    const open = DIALOGS[0][1];
    const wide = { width: 1280, height: 720 };
    const narrow = { width: 800, height: 720 };
    await page.setViewportSize(wide);
    const usual = await dialogTextSizes(page, open);
    expect(usual.length).toBeGreaterThan(0);
    await page.setViewportSize(narrow);
    await openDialog(page, open, 'html { font-size: 10px; } @media (max-width: 900px) { html { font-size: 16px; } }');

    await page.setViewportSize(wide);

    await expect.poll(() => openDialogTextSizes(page)).toEqual(usual);

    await page.setViewportSize(narrow);

    await expect.poll(() => openDialogTextSizes(page)).toEqual(usual);
  });

  test('keeps a reader\'s larger default font size under a 10px root', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'sets the default font size through the Chrome DevTools Protocol');
    // What a reader gets by raising the default font size in their browser's
    // settings. A page that leaves its root alone passes it on to the dialogs,
    // and one that shrinks its root must not take it away from them -- nor
    // may the dialogs be pinned to 16px to get there.
    const open = DIALOGS[0][1];
    const atUsualDefault = pixels(await dialogTextSizes(page, open));
    const usualDefault = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    const session = await page.context().newCDPSession(page);
    await session.send('Page.setFontSizes', { fontSizes: { standard: 20 } });

    const underRootLeftAlone = await dialogTextSizes(page, open);
    const underSmallRoot = await dialogTextSizes(page, open, '10px');

    const scale = 20 / Number.parseFloat(usualDefault);
    expect(pixels(underRootLeftAlone)).toEqual(atUsualDefault.map(size => size * scale));
    expect(underSmallRoot).toEqual(underRootLeftAlone);
  });
});
