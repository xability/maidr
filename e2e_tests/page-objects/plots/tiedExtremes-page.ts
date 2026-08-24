import type { Page } from '@playwright/test';
import { TestConstants } from '../../utils/constants';
import { TestError } from '../../utils/errors';
import { BasePage } from '../base-page';

/**
 * Page object for the tied-extremes keyboard fixture.
 *
 * The fixture is a single bar row whose highest value is shared by three bars
 * and lowest by two, which no chart in `examples/` does. It exposes only the
 * navigation `BasePage` already provides — the bracket jumps and the reads
 * that check where they landed — since the point of the page is the keyboard
 * behaviour rather than any chart-specific interaction.
 */
export class TiedExtremesPage extends BasePage {
  /**
   * Selectors for various UI elements
   */
  protected override readonly selectors = {
    notification: `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER} ${TestConstants.PARAGRAPH}`,
    info: `#${TestConstants.MAIDR_INFO_CONTAINER} ${TestConstants.PARAGRAPH}`,
    svg: 'svg#tied-extremes',
    helpModal: TestConstants.MAIDR_HELP_MODAL,
    helpModalTitle: TestConstants.MAIDR_HELP_MODAL_TITLE,
    helpModalClose: TestConstants.HELP_MENU_CLOSE_BUTTON,
    settingsModal: TestConstants.MAIDR_SETTINGS_MODAL,
    chatModal: TestConstants.MAIDR_CHAT_MODAL,
  };

  /**
   * Creates a new TiedExtremesPage instance
   * @param page - The Playwright page object
   */
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigates to the tied-extremes fixture.
   * @returns Promise resolving when navigation completes
   * @throws TestError if navigation fails
   */
  public async navigateToTiedExtremes(): Promise<void> {
    try {
      await super.navigateTo('e2e_tests/fixtures/tied-extremes.html');
      await super.verifyPlotLoaded(this.selectors.svg);
    } catch (error) {
      throw new TestError('Failed to navigate to the tied-extremes fixture', { cause: error });
    }
  }

  /**
   * Activates MAIDR by focusing the plot.
   * @returns Promise resolving when MAIDR is activated
   * @throws TestError if MAIDR cannot be activated
   */
  public override async activateMaidr(): Promise<void> {
    try {
      await super.activateMaidr(this.selectors.svg, 'tied-extremes');
    } catch (error) {
      throw new TestError('Failed to activate MAIDR on the tied-extremes fixture', { cause: error });
    }
  }

  /**
   * Reads the text currently shown for the cursor's point.
   * @returns The announced point text.
   */
  public override async getCurrentDataPointInfo(): Promise<string> {
    return super.getCurrentDataPointInfo(this.selectors.info);
  }
}
