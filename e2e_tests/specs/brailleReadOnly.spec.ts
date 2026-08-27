import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';
import { TestConstants } from '../utils/constants';

/**
 * The braille field takes no text (#1131).
 *
 * It is a `<textarea>` because that is the only control a braille display's
 * routing keys can reach: they place the caret, and the app reads where it
 * landed to move the reader to that cell. Nothing about that needs the field
 * to accept text, and left editable it misbehaved twice over.
 *
 * Typing inserts a character, inserting moves the caret, and a moved caret is
 * indistinguishable from cursor routing -- so a digit, on a keyboard row
 * nothing is bound to, walked the reader onto a different data point. Worse,
 * when that walk was refused because the reader was already at the end of the
 * data, the effect that rewrites the field from the view model never ran and
 * the character stayed, leaving the braille line showing a cell that is not in
 * the chart.
 *
 * This lives in the browser suite rather than the component one on purpose:
 * `readOnly` is enforced by the browser's own input handling, and jsdom will
 * happily assign straight past it. A jsdom test that "types" would pass with
 * the guard removed.
 */

const BRAILLE = `textarea[id^="${TestConstants.BRAILLE_TEXTAREA}"]`;

/**
 * Opens the bar plot with braille on and the reader on the first point.
 * @param page - The Playwright page
 */
async function openBraille(page: import('@playwright/test').Page): Promise<void> {
  const plot = new BarPlotPage(page);
  await plot.navigateToBarPlot();
  await plot.activateMaidr();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('b');
  await page.waitForSelector(BRAILLE);
}

test.describe('braille field', () => {
  test('should not move the reader when a digit is pressed', async ({ page }) => {
    await openBraille(page);
    const before = await page.$eval(BRAILLE, el => ({
      value: (el as HTMLTextAreaElement).value,
      caret: (el as HTMLTextAreaElement).selectionStart,
    }));

    for (const digit of ['5', '3', '9']) {
      await page.keyboard.press(digit);
    }

    const after = await page.$eval(BRAILLE, el => ({
      value: (el as HTMLTextAreaElement).value,
      caret: (el as HTMLTextAreaElement).selectionStart,
    }));
    expect(after.caret).toBe(before.caret);
    expect(after.value).toBe(before.value);
  });

  test('should keep its content when a printable key lands at the end of the data', async ({ page }) => {
    // The case the value/index effect cannot clean up after: with the reader
    // already at the last point there is nothing for the typed character to
    // move, so nothing rewrites the field and the character would simply stay.
    await openBraille(page);
    const value = await page.$eval(BRAILLE, el => (el as HTMLTextAreaElement).value);

    await page.keyboard.press('Control+ArrowRight');
    for (const key of ['\'', '5', ';']) {
      await page.keyboard.press(key);
    }

    expect(await page.$eval(BRAILLE, el => (el as HTMLTextAreaElement).value)).toBe(value);
  });

  test('should still follow a caret placed on it', async ({ page }) => {
    // Cursor routing has to survive the guard: it is the whole reason the
    // field is a textarea.
    await openBraille(page);

    await page.$eval(BRAILLE, (el) => {
      const textArea = el as HTMLTextAreaElement;
      textArea.focus();
      textArea.setSelectionRange(2, 2);
    });

    await expect.poll(async () => page.$eval(
      BRAILLE,
      el => (el as HTMLTextAreaElement).selectionStart,
    )).toBe(2);
  });
});
