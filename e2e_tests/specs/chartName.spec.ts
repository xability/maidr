import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';

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
 */

const NAME = 'The Number of Tips by Day, Bar Chart';
const KEYS = 'Use Arrows to navigate data points. Toggle B for Braille, T for Text, '
  + 'S for Sonification, and R for Review mode. Press Control Slash for keyboard help.';
const BEFORE_FOCUS = `This is a maidr plot of type: vertical bar. Click to activate. ${KEYS}`;
const ON_FOCUS = `This is a maidr plot of type: vertical bar. ${KEYS}`;

/**
 * Opens the bar chart.
 * @param page - The Playwright page
 * @returns The page object and the element a reader focuses
 */
async function openBarPlot(page: Page): Promise<{ barPlotPage: BarPlotPage; plot: Locator }> {
  const barPlotPage = new BarPlotPage(page);
  await barPlotPage.navigateToBarPlot();
  const plot = page.locator('article[id^="maidr-article"] figure > div[tabindex="0"]').first();
  return { barPlotPage, plot };
}

test.describe('the chart\'s name and description', () => {
  test('names the chart by its title and type, and describes it by its keys, before it is focused', async ({ page }) => {
    const { plot } = await openBarPlot(page);

    await expect(plot).toHaveAccessibleName(NAME);
    await expect(plot).toHaveAccessibleDescription(BEFORE_FOCUS);
    // The instructions are given once: until a mouse is over the chart, there
    // is no title, which some screen readers would read too.
    await expect(plot).not.toHaveAttribute('title');
  });

  test('shows a mouse user the instructions as a tooltip while the mouse is over the chart', async ({ page }) => {
    const { plot } = await openBarPlot(page);
    // Room beside the chart, for the mouse to leave it to.
    await page.setViewportSize({ width: 2400, height: 1800 });
    const box = await plot.boundingBox();
    if (box === null) {
      throw new Error('The plot is not laid out');
    }

    await plot.hover();

    await expect(plot).toHaveAttribute('title', BEFORE_FOCUS);
    await expect(plot).toHaveAccessibleName(NAME);
    await expect(plot).toHaveAccessibleDescription(BEFORE_FOCUS);

    await page.mouse.move(box.x + box.width + 20, box.y + box.height + 20);

    await expect(plot).not.toHaveAttribute('title');
  });

  test('takes the tooltip away once the chart is clicked', async ({ page }) => {
    const { plot } = await openBarPlot(page);
    await plot.hover();
    await expect(plot).toHaveAttribute('title', BEFORE_FOCUS);

    await plot.click();

    await expect(plot).toBeFocused();
    await expect(plot).not.toHaveAttribute('title');
  });

  test('takes the tooltip away once the chart is entered from the keyboard', async ({ page }) => {
    const { barPlotPage, plot } = await openBarPlot(page);
    await plot.hover();
    await expect(plot).toHaveAttribute('title', BEFORE_FOCUS);

    await barPlotPage.activateMaidr();

    await expect(plot).not.toHaveAttribute('title');
  });

  test('keeps the name and drops the click prompt once the chart is focused', async ({ page }) => {
    const { barPlotPage, plot } = await openBarPlot(page);

    await barPlotPage.activateMaidr();

    await expect(plot).toHaveAccessibleName(NAME);
    await expect(plot).toHaveAccessibleDescription(ON_FOCUS);
  });

  test('keeps the name and stops describing the chart once the reader moves', async ({ page }) => {
    const { barPlotPage, plot } = await openBarPlot(page);
    await barPlotPage.activateMaidr();

    await page.keyboard.press('ArrowRight');

    await expect(plot).toHaveAccessibleName(NAME);
    await expect(plot).toHaveAccessibleDescription('');
  });

  test('describes the chart with the click prompt again once the reader leaves', async ({ page }) => {
    const { barPlotPage, plot } = await openBarPlot(page);
    await barPlotPage.activateMaidr();
    await page.keyboard.press('ArrowRight');

    await plot.evaluate(element => (element as HTMLElement).blur());

    await expect(plot).toHaveAccessibleName(NAME);
    await expect(plot).toHaveAccessibleDescription(BEFORE_FOCUS);
    await expect(plot).not.toHaveAttribute('title');
  });
});
