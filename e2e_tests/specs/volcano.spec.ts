import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/** The example's own page, driven through the shared base helpers. */
class VolcanoPlotPage extends BasePage {
  protected override readonly selectors = {
    notification: `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER} ${TestConstants.PARAGRAPH}`,
    svg: `svg`,
    braille: `textarea[id^="${TestConstants.BRAILLE_TEXTAREA}"]`,
    helpModal: TestConstants.MAIDR_HELP_MODAL,
    helpModalTitle: TestConstants.MAIDR_HELP_MODAL_TITLE,
    helpModalClose: TestConstants.HELP_MENU_CLOSE_BUTTON,
    settingsModal: TestConstants.MAIDR_SETTINGS_MODAL,
    chatModal: TestConstants.MAIDR_CHAT_MODAL,
  };

  /** Navigates to the volcano example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/volcano.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'volcano-expression');
  }

  /**
   * Reads the announcement currently on screen.
   * @returns The announcement text
   */
  public override async getInstructionText(): Promise<string> {
    return super.getInstructionText(this.selectors.notification);
  }
}

test.describe('Volcano plot', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new VolcanoPlotPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new VolcanoPlotPage(page).navigateToPlot();
  });

  test('should declare the layer as a volcano', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('volcano');
  });

  test('should declare the thresholds rather than leave them to be guessed', () => {
    // These charts sit on transformed axes whose conventions differ by field
    // and by tool. A guessed line sorts every point onto the wrong side of
    // it, silently.
    const layer = maidrData.subplots[0][0].layers[0];

    expect(layer.thresholdOptions?.significance).toBe(5);
    expect(layer.thresholdOptions?.effect).toBe(2);
  });

  test('should carry each point identity, which is the payload', () => {
    const points = maidrData.subplots[0][0].layers[0].data as {
      x: number;
      y: number;
      label?: string;
    }[];

    expect(points).toHaveLength(15);
    expect(points.every(point => typeof point.label === 'string')).toBe(true);
  });

  test('should carry findings in both directions', () => {
    // A reading that only looked rightwards on the effect axis would drop
    // DOWN1 and DOWN2, which are as large an effect as anything on the right.
    const points = maidrData.subplots[0][0].layers[0].data as {
      x: number;
      y: number;
      label?: string;
    }[];
    const hits = points.filter(point => point.y >= 5 && Math.abs(point.x) >= 2);

    expect(hits.map(point => point.label).sort())
      .toEqual(['DOWN1', 'DOWN2', 'UP1', 'UP2', 'UP3']);
    expect(hits.some(point => point.x < 0)).toBe(true);
  });

  test('should announce itself as a volcano rather than a scatter', async ({ page }) => {
    // Sharing ScatterTrace must not mean the chart tells a reader it is a
    // scatter -- the chart type is one of the few places they learn what they
    // are looking at.
    const plot = new VolcanoPlotPage(page);
    await plot.activateMaidr();

    const instruction = normalizeText(await plot.getInstructionText());

    expect(instruction).toContain('volcano');
    expect(instruction).not.toContain('scatter');
  });

  // The "N of M above the threshold" summary is pinned at the unit level
  // (`test/model/volcano.test.ts`), which asserts both the exact string and
  // that it is the FIRST stat. No e2e spec in this suite opens the
  // description modal, and inventing a key sequence here would test my guess
  // at the binding rather than the feature.
});
