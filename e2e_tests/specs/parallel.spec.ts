import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/**
 * Every braille cell MAIDR can emit lives in the Unicode braille block
 * (U+2800 to U+28FF), so a display carrying anything else is not braille
 * output.
 */
const BRAILLE_CELL = /^[\u2800-\u28FF]+$/;

/** The example's own page, driven through the shared base helpers. */
class ParallelPlotPage extends BasePage {
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

  /** Navigates to the parallel coordinates example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/parallel.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'parallel-cars');
  }

  /**
   * Reads the announcement currently on screen.
   * @returns The announcement text
   */
  public override async getInstructionText(): Promise<string> {
    return super.getInstructionText(this.selectors.notification);
  }

  /**
   * Reads the current contents of the braille display.
   * @returns The braille content, whitespace trimmed
   */
  public async getBrailleContent(): Promise<string> {
    const textarea = await this.waitForElement(this.selectors.braille);
    return (await textarea.inputValue()).trim();
  }
}

test.describe('Parallel coordinates', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new ParallelPlotPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new ParallelPlotPage(page).navigateToPlot();
  });

  test('should declare the layer as parallel coordinates', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('parallel_coordinates');
  });

  test('should carry one observation per car over the same axes', () => {
    const layer = maidrData.subplots[0][0].layers[0];
    const observations = layer.data as { x: string; y: number }[][];

    expect(observations).toHaveLength(4);
    for (const observation of observations) {
      expect(observation.map(point => point.x)).toEqual(['mpg', 'hp', 'weight']);
    }
  });

  test('should announce itself as parallel coordinates rather than a line', async ({ page }) => {
    // The trace extends the line model, which names itself 'single line' or
    // 'multiline'. A reader told they are on a line plot has been told the
    // wrong chart.
    const plot = new ParallelPlotPage(page);
    await plot.activateMaidr();

    const instruction = normalizeText(await plot.getInstructionText());

    expect(instruction).toContain('parallel coordinates');
  });

  test('should announce the axis and the raw value, not a normalized rank', async ({ page }) => {
    // The pitch carries the position on the axis; the announcement has to
    // carry the number, or the reader is told a rank they cannot act on.
    const plot = new ParallelPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('mpg');
    expect(announcement).toContain('33');
  });

  test('should render one braille row per observation', async ({ page }) => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    const plot = new ParallelPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const rows = (await plot.getBrailleContent()).split('\n');

    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row).toMatch(BRAILLE_CELL);
      expect(row).toHaveLength(3);
    }
  });
});
