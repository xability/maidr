import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/** Every braille cell MAIDR can emit lives in the Unicode braille block. */
const BRAILLE_CELL = /^[\u2800-\u28FF]+$/;

/** The example's own page, driven through the shared base helpers. */
class SurvivalPlotPage extends BasePage {
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

  /** Navigates to the survival example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/survival.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'survival-overall');
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
   * @returns The braille content, trailing newline removed
   */
  public async getBrailleContent(): Promise<string> {
    const textarea = await this.waitForElement(this.selectors.braille);
    return (await textarea.inputValue()).replace(/\n$/, '');
  }
}

test.describe('Survival curve', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new SurvivalPlotPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new SurvivalPlotPage(page).navigateToPlot();
  });

  test('should declare the layer as a survival curve', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('survival');
  });

  test('should announce itself as a survival curve, not a step chart', async ({ page }) => {
    // `StepTrace` forces the plot type to 'step'. A survival curve is a step
    // chart, but it is not *a step chart* to a reader, and the chart type is
    // one of the few places they learn what they are looking at.
    const plot = new SurvivalPlotPage(page);
    await plot.activateMaidr();

    const instruction = normalizeText(await plot.getInstructionText());

    expect(instruction).toContain('survival');
    expect(instruction).not.toContain('step');
  });

  test('should hold the estimate across a censored time', () => {
    // Months 9 and 12 on `Treatment` are both 0.79 -- the curve does not step
    // at a censored time, which is exactly why the announcement has to say
    // one of them is censored.
    const arms = maidrData.subplots[0][0].layers[0].data as {
      x: number;
      y: number;
      censored?: boolean;
    }[][];
    const treatment = arms[1];
    const atNine = treatment.find(point => point.x === 9);
    const atTwelve = treatment.find(point => point.x === 12);

    expect(atNine?.y).toBe(atTwelve?.y);
    expect(atTwelve?.censored).toBe(true);
    expect(atNine?.censored).toBeUndefined();
  });

  test('should announce the time and the survival probability', async ({ page }) => {
    const plot = new SurvivalPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Months');
    expect(announcement).toContain('Survival probability');
  });

  test('should render one braille row per arm', async ({ page }) => {
    // An unregistered braille encoder is the one registration failure that is
    // silent: the display stays blank while text and audio keep working.
    const plot = new SurvivalPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const rows = (await plot.getBrailleContent()).split('\n');

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatch(BRAILLE_CELL);
    }
  });
});
