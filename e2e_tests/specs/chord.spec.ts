import { expect, test } from '@playwright/test';
import { BasePage } from '../page-objects/base-page';
import { TestConstants } from '../utils/constants';
import { normalizeText } from '../utils/text';

/** The example's own page, driven through the shared base helpers. */
class ChordPage extends BasePage {
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

  /** Navigates to the chord example. */
  public async navigateToPlot(): Promise<void> {
    await super.navigateTo('examples/chord.html');
    await super.verifyPlotLoaded(this.selectors.svg);
  }

  /** Activates MAIDR on the chart. */
  public override async activateMaidr(): Promise<void> {
    await super.activateMaidr(this.selectors.svg, 'chord-trade');
  }

  /**
   * Reads the announcement currently on screen.
   * @returns The announcement text
   */
  public override async getInstructionText(): Promise<string> {
    return super.getInstructionText(this.selectors.notification);
  }
}

// Trade between four regions. Each region's largest export leads to another
// region whose largest export leads on, round all four and back: Americas to
// Europe (34), Europe to Asia (30), Asia to Africa (28), Africa to Americas
// (15). Following the largest flow never runs out.
test.describe('Chord diagram', () => {
  test.beforeEach(async ({ page }) => {
    await new ChordPage(page).navigateToPlot();
  });

  test('should say there is no end to jump to where the largest flows go round in a cycle', async ({ page }) => {
    const plot = new ChordPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    await plot.moveToLastDataPoint();
    const announcement = normalizeText(await plot.getInstructionText());

    expect(announcement).toContain('No end to go to');
    expect(announcement).toContain('Americas');
  });

  test('should say there is no start to jump back to either', async ({ page }) => {
    const plot = new ChordPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();

    await plot.moveToFirstDataPoint();

    expect(normalizeText(await plot.getInstructionText())).toContain('No start to go to');
  });

  test('should leave the reader where they were, so the next arrow follows on from there', async ({ page }) => {
    // The jump used to land on Africa, the last region before the cycle came
    // back to the Americas, and the next Right went on to the Americas.
    const plot = new ChordPage(page);
    await plot.activateMaidr();
    await plot.moveToNextDataPoint();
    await plot.moveToLastDataPoint();

    await plot.moveToNextDataPoint();

    expect(normalizeText(await plot.getInstructionText())).toContain('Along is Americas to Europe');
  });
});
