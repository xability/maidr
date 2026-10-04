import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/** Every braille cell MAIDR can emit lives in the Unicode braille block. */
const BRAILLE_CELL = /^[\u2800-\u28FF]+$/;

/** The example's own page, driven through the shared base helpers. */
class DirectedGraphPage extends BasePage {
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

  /** Navigates to the directed graph example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/directed-graph.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'dag-resnet');
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

test.describe('Directed graph', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new DirectedGraphPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new DirectedGraphPage(page).navigateToPlot();
  });

  test('should declare the layer as a directed graph', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('directed_graph');
  });

  test('should enter on the graph input and announce its connections', async ({ page }) => {
    const plot = new DirectedGraphPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('input_1');
    expect(announcement).toContain('0 inputs, 1 output');
    expect(announcement).toContain('graph input');
    expect(announcement).toContain('InputLayer');
  });

  test('should walk the top level input to output, scopes closed', async ({ page }) => {
    const plot = new DirectedGraphPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('block1');
    expect(announcement).toContain('3 nodes inside');
  });

  test('should open a scope with down and close it with up', async ({ page }) => {
    const plot = new DirectedGraphPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();
    await plot.moveToDataPointBelow();

    expect(normalizeText(await plot.getInstructionText())).toContain('conv1');

    await plot.moveToNextDataPoint();
    await plot.moveToNextDataPoint();

    const merge = normalizeText(await plot.getInstructionText());
    expect(merge).toContain('add');
    expect(merge).toContain('2 inputs, 1 output');
    expect(merge).toContain('merge point');

    await plot.moveToDataPointAbove();

    expect(normalizeText(await plot.getInstructionText())).toContain('block1');
  });

  test('should render one braille row per depth of nesting', async ({ page }) => {
    // An unregistered braille encoder is the one registration failure that is
    // silent: the display stays blank while text and audio keep working.
    const plot = new DirectedGraphPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const rows = (await plot.getBrailleContent()).split('\n');

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatch(BRAILLE_CELL);
    }
  });

  test('should announce itself as a directed graph', async ({ page }) => {
    const plot = new DirectedGraphPage(page);
    await plot.activateMaidr();

    expect(normalizeText(await plot.getInstructionText()).toLowerCase())
      .toContain('directed graph');
  });
});
