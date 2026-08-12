import type { Maidr } from '../../src/type/grammar';
import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { extractMaidrData } from '../utils/maidr-data';
import { normalizeText } from '../utils/text';

/** Every braille cell MAIDR can emit lives in the Unicode braille block. */
const BRAILLE_CELL = /^[\u2800-\u28FF]+$/;

/** The example's own page, driven through the shared base helpers. */
class ChoroplethPage extends BasePage {
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

  /** Navigates to the choropleth example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/choropleth.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'choropleth-west');
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

test.describe('Choropleth map', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new ChoroplethPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new ChoroplethPage(page).navigateToPlot();
  });

  test('should declare the layer as a choropleth', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('choropleth');
  });

  test('should carry a centroid in degrees and a border list per region', () => {
    // Degrees rather than projected coordinates is what settles which way is
    // north, and the borders are declared because nothing can recover them.
    const regions = maidrData.subplots[0][0].layers[0].data as {
      x: string;
      lat?: number;
      lon?: number;
      neighbors?: string[];
    }[];

    expect(regions).toHaveLength(11);
    for (const region of regions) {
      expect(region.lat).toBeGreaterThan(30);
      expect(region.lat).toBeLessThan(50);
      expect(region.neighbors?.length).toBeGreaterThan(0);
    }
  });

  test('should enter in the south-west rather than on the first declared region', () => {
    // Washington is declared first. California is the south-west corner, and
    // entering there is the whole of the difference between a map and a
    // region list.
    expect((maidrData.subplots[0][0].layers[0].data as { x: string }[])[0].x)
      .toBe('Washington');
  });

  test('should move north on up and east on right', async ({ page }) => {
    const plot = new ChoroplethPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    expect(normalizeText(await plot.getInstructionText())).toContain('California');

    await plot.moveToDataPointAbove();

    // Oregon is directly north of California.
    expect(normalizeText(await plot.getInstructionText())).toContain('Oregon');

    await plot.moveToNextDataPoint();

    // Nevada is east of Oregon in the same band.
    expect(normalizeText(await plot.getInstructionText())).toContain('Nevada');
  });

  test('should say how a region compares with the ones around it', async ({ page }) => {
    // The gradient a sighted reader takes from the shading, and the one thing
    // a walk of the regions in any order cannot assemble.
    const plot = new ChoroplethPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Neighbours');
    // California is the highest region on the map, so every border it has is
    // a border down.
    expect(announcement).toContain('all lower');
  });

  test('should render one braille row per latitude band', async ({ page }) => {
    // An unregistered braille encoder is the one registration failure that is
    // silent: the display stays blank while text and audio keep working.
    const plot = new ChoroplethPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const rows = (await plot.getBrailleContent()).split('\n');

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatch(BRAILLE_CELL);
    }
  });

  test('should announce itself as a map rather than a bar chart', async ({ page }) => {
    const plot = new ChoroplethPage(page);
    await plot.activateMaidr();

    expect(normalizeText(await plot.getInstructionText()).toLowerCase())
      .toContain('choropleth');
  });
});
