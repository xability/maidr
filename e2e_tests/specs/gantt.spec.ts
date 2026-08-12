import type { GanttData, Maidr } from '../../src/type/grammar';
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
class GanttPlotPage extends BasePage {
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

  /** Navigates to the gantt example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/gantt.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'gantt-project-schedule');
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
    // Only the trailing newline is stripped, not the whitespace before it: a
    // lane with nothing booked renders as an empty row, and trimming would
    // delete it and leave the reader's line count one short of the chart's.
    return (await textarea.inputValue()).replace(/\n$/, '');
  }
}

test.describe('Gantt', () => {
  let maidrData: Maidr;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const plot = new GanttPlotPage(page);
      await plot.navigateToPlot();
      await page.waitForSelector(`svg`, { timeout: 10000 });

      maidrData = await extractMaidrData(page);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await new GanttPlotPage(page).navigateToPlot();
  });

  test('should declare the layer as a gantt', () => {
    expect(maidrData.subplots[0][0].layers[0].type).toBe('gantt');
  });

  test('should carry a lane per phase, one of them empty', () => {
    // A lane with nothing booked is a real statement about a schedule, and a
    // flat list grouped by lane cannot express one -- which is why the data
    // is nested.
    const { points } = maidrData.subplots[0][0].layers[0].data as GanttData;

    expect(points).toHaveLength(4);
    expect(points.filter(lane => lane.length === 0)).toHaveLength(1);
  });

  test('should announce itself as a gantt', async ({ page }) => {
    const plot = new GanttPlotPage(page);
    await plot.activateMaidr();

    expect(normalizeText(await plot.getInstructionText())).toContain('gantt');
  });

  test('should announce both ends of an interval and its length', async ({ page }) => {
    // The whole point of the trace: an interval is a span, and announcing
    // either end alone names one edge of a bar as though it were the bar.
    const plot = new GanttPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Wireframes');
    expect(announcement).toContain('0 through 30');
    expect(announcement).toContain('30 days');
  });

  test('should let a reader arrow onto the empty lane and be told so', async ({ page }) => {
    // The shipped example's `Launch` lane is empty on purpose, and it is
    // reached by ordinary arrow keys. Reading the payload does not exercise
    // that path -- only pressing the key does, which is why this goes through
    // the keyboard rather than through `extractMaidrData`.
    const plot = new GanttPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    // Lane 0 is the bottom row, so UP walks towards `Launch`, three lanes up.
    for (let lane = 0; lane < 3; lane++) {
      await plot.moveToDataPointAbove();
    }

    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('Launch');
    expect(announcement).toContain('Intervals is 0');
    // Not the boundary cue: the lane is a real row of the schedule.
    expect(announcement).not.toContain('No more data');
  });

  test('should render one braille row per lane', async ({ page }) => {
    // Braille is the modality that fails silently for a new trace type: an
    // unregistered encoder leaves the display blank while text and audio keep
    // working, so nothing else in the suite would catch it.
    const plot = new GanttPlotPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.toggleBrailleMode();

    const rows = (await plot.getBrailleContent()).split('\n');

    expect(rows).toHaveLength(4);
    for (const row of rows) {
      // The empty lane renders as an empty row rather than as a missing one,
      // so the reader's line count still matches the chart's lane count.
      if (row.length > 0) {
        expect(row).toMatch(BRAILLE_CELL);
      }
    }
  });
});
