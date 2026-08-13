import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/**
 * A grouped error bar chart poses one question — do the two groups' intervals
 * overlap at this category? — and answering it means reading both groups.
 *
 * They are separate layers, so the reader moves between them rather than
 * arrowing. What makes that readable is each layer saying which group it is:
 * without a name both announce "error_bar plot" and the reader hears two sets
 * of numbers with nothing to attach them to.
 */

/** The example's own page, driven through the shared base helpers. */
class GroupedErrorBarPage extends BasePage {
  protected override readonly selectors = {
    notification: `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER} ${TestConstants.PARAGRAPH}`,
    svg: `svg`,
    helpModal: TestConstants.MAIDR_HELP_MODAL,
    helpModalTitle: TestConstants.MAIDR_HELP_MODAL_TITLE,
    helpModalClose: TestConstants.HELP_MENU_CLOSE_BUTTON,
    settingsModal: TestConstants.MAIDR_SETTINGS_MODAL,
    chatModal: TestConstants.MAIDR_CHAT_MODAL,
  };

  /** Navigates to the grouped error bar example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/errorbar-grouped.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'errorbar-grouped');
  }

  /**
   * Reads the announcement currently on screen.
   * @returns The announcement text
   */
  public override async getInstructionText(): Promise<string> {
    return super.getInstructionText(this.selectors.notification);
  }

  /** Moves to the next layer. */
  public async moveToNextLayer(): Promise<void> {
    await this.pressKey(TestConstants.PAGE_UP_KEY, 'move to the next layer');
  }
}

test.describe('Grouped error bar', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new GroupedErrorBarPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new GroupedErrorBarPage(page).navigateToPlot();
  });

  test('should carry two layers of the same kind in one subplot', () => {
    // The shape the naming exists for. Two layers of *different* kinds are
    // already told apart by their types.
    const { layers } = maidrData.subplots[0][0];

    expect(layers).toHaveLength(2);
    expect(layers.map(layer => layer.type)).toEqual(['error_bar', 'error_bar']);
    expect(layers.map(layer => layer.name)).toEqual(['Male', 'Female']);
  });

  test('should name each layer on the way in', async ({ page }) => {
    const plot = new GroupedErrorBarPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToNextLayer();

    const announcement = normalizeText(await plot.getInstructionText());

    // The group, not "error_bar plot".
    expect(announcement).toContain('Female');
    expect(announcement).not.toContain('error_bar plot');
  });

  test('should land on the same category in the other layer', async ({ page }) => {
    // What makes the two comparable: the switch keeps the reader's position,
    // so the intervals announced either side of it are the same category's.
    const plot = new GroupedErrorBarPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const before = normalizeText(await plot.getInstructionText());
    await plot.moveToNextLayer();
    const after = normalizeText(await plot.getInstructionText());

    expect(before).toContain('Thur');
    expect(after).toContain('Thur');
    // Same category, different group, different reading.
    expect(before).toContain('18.7');
    expect(after).toContain('16.7');
  });
});
