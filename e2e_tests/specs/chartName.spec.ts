import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';
import { TestConstants } from '../utils/constants';
import { modifierKey } from '../utils/platform';

/**
 * The element a reader focuses is named by what the chart is and described by
 * how to use it (#1384). A screen reader lists and moves between charts by
 * name, reads the name every time it reaches one, and lets a reader turn
 * descriptions down; the instructions used to be the name, so every chart was
 * "This is a maidr plot of type: …" and they could not be turned down.
 *
 * The name stays for as long as the chart is on the page. The description is
 * given while the reader enters the chart and taken away once they use it, so
 * it is not read again each time focus returns to the plot, and comes back
 * with the click prompt when they leave.
 *
 * A sighted mouse user is shown the same instructions as a tooltip, which is
 * how they learn to click the chart at all (#244). It is the plot's title only
 * while a mouse is over a chart not in use, so a screen reader does not read
 * the instructions twice.
 *
 * Pressing past the first or last point tells the reader so in an
 * announcement and nothing else: the plot keeps the focus, so a screen reader
 * does not read the chart's name again.
 */

const NAME = 'The Number of Tips by Day, Bar Chart';

/** The bar chart, the element a reader focuses on it, and what it says to do. */
interface BarPlot {
  readonly barPlotPage: BarPlotPage;
  readonly plot: Locator;
  /** The description before the chart is focused, with the click prompt. */
  readonly beforeFocus: string;
  /** The description once it is focused. */
  readonly onFocus: string;
}

/**
 * Opens the bar chart.
 *
 * The keys it describes name the modifier MAIDR binds in this browser:
 * Command where the browser reports a Mac, as Playwright's WebKit does on any
 * host, and Control elsewhere.
 * @param page - The Playwright page
 * @returns The chart
 */
async function openBarPlot(page: Page): Promise<BarPlot> {
  const barPlotPage = new BarPlotPage(page);
  await barPlotPage.navigateToBarPlot();
  const plot = page.locator('article[id^="maidr-article"] figure > div[tabindex="0"]').first();
  const modifier = (await modifierKey(page)) === 'Meta' ? 'Command' : 'Control';
  const keys = 'Use Arrows to navigate data points. Toggle B for Braille, T for Text, '
    + `S for Sonification, and R for Review mode. Press ${modifier} Slash for keyboard help.`;
  return {
    barPlotPage,
    plot,
    beforeFocus: `This is a maidr plot of type: vertical bar. Click to activate. ${keys}`,
    onFocus: `This is a maidr plot of type: vertical bar. ${keys}`,
  };
}

test.describe('the chart\'s name and description', () => {
  test('names the chart by its title and type, and describes it by its keys, before it is focused', async ({ page }) => {
    const { plot, beforeFocus } = await openBarPlot(page);

    await expect(plot).toHaveAccessibleName(NAME);
    await expect(plot).toHaveAccessibleDescription(beforeFocus);
    // The instructions are given once: until a mouse is over the chart, there
    // is no title, which some screen readers would read too.
    await expect(plot).not.toHaveAttribute('title');
  });

  test('shows a mouse user the instructions as a tooltip while the mouse is over the chart', async ({ page }) => {
    const { plot, beforeFocus } = await openBarPlot(page);
    // Room beside the chart, for the mouse to leave it to.
    await page.setViewportSize({ width: 2400, height: 1800 });
    const box = await plot.boundingBox();
    if (box === null) {
      throw new Error('The plot is not laid out');
    }

    await plot.hover();

    await expect(plot).toHaveAttribute('title', beforeFocus);
    await expect(plot).toHaveAccessibleName(NAME);
    await expect(plot).toHaveAccessibleDescription(beforeFocus);

    await page.mouse.move(box.x + box.width + 20, box.y + box.height + 20);

    await expect(plot).not.toHaveAttribute('title');
  });

  test('takes the tooltip away once the chart is clicked', async ({ page }) => {
    const { plot, beforeFocus } = await openBarPlot(page);
    await plot.hover();
    await expect(plot).toHaveAttribute('title', beforeFocus);

    await plot.click();

    await expect(plot).toBeFocused();
    await expect(plot).not.toHaveAttribute('title');
  });

  test('takes the tooltip away once the chart is entered from the keyboard', async ({ page }) => {
    const { barPlotPage, plot, beforeFocus } = await openBarPlot(page);
    await plot.hover();
    await expect(plot).toHaveAttribute('title', beforeFocus);

    await barPlotPage.activateMaidr();

    await expect(plot).not.toHaveAttribute('title');
  });

  test('keeps the name and drops the click prompt once the chart is focused', async ({ page }) => {
    const { barPlotPage, plot, onFocus } = await openBarPlot(page);

    await barPlotPage.activateMaidr();

    await expect(plot).toHaveAccessibleName(NAME);
    await expect(plot).toHaveAccessibleDescription(onFocus);
  });

  test('keeps the name and stops describing the chart once the reader moves', async ({ page }) => {
    const { barPlotPage, plot } = await openBarPlot(page);
    await barPlotPage.activateMaidr();

    await page.keyboard.press('ArrowRight');

    await expect(plot).toHaveAccessibleName(NAME);
    await expect(plot).toHaveAccessibleDescription('');
  });

  test('describes the chart with the click prompt again once the reader leaves', async ({ page }) => {
    const { barPlotPage, plot, beforeFocus } = await openBarPlot(page);
    await barPlotPage.activateMaidr();
    await page.keyboard.press('ArrowRight');

    await plot.evaluate(element => (element as HTMLElement).blur());

    await expect(plot).toHaveAccessibleName(NAME);
    await expect(plot).toHaveAccessibleDescription(beforeFocus);
    await expect(plot).not.toHaveAttribute('title');
  });

  test('says only that there is no more data when the reader presses past either end', async ({ page }) => {
    const { barPlotPage, plot } = await openBarPlot(page);
    await barPlotPage.activateMaidr();
    await page.keyboard.press('ArrowRight');
    // Leaving and taking the focus again is what has a screen reader read the
    // chart's name, so count every time the plot does either.
    await plot.evaluate((element) => {
      const counted = window as unknown as { focusChanges: number };
      counted.focusChanges = 0;
      element.addEventListener('blur', () => {
        counted.focusChanges += 1;
      });
      element.addEventListener('focus', () => {
        counted.focusChanges += 1;
      });
    });
    const announcement = page.locator(TestConstants.MAIDR_ANNOUNCEMENT_REGION);

    await page.keyboard.press('ArrowLeft');
    await expect(announcement).toHaveText('No more data to display');
    for (let move = 0; move < 3; move++) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(announcement).toHaveText(/Friday/);
    await page.keyboard.press('ArrowRight');
    await expect(announcement).toHaveText('No more data to display');

    expect(await page.evaluate(() => (window as unknown as { focusChanges: number }).focusChanges)).toBe(0);
    await expect(plot).toBeFocused();
    await expect(plot).toHaveAccessibleName(NAME);
    await expect(plot).toHaveAccessibleDescription('');
  });
});
