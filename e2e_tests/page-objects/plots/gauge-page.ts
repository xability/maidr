import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { TestConstants } from '../../utils/constants';
import { GaugePlotError } from '../../utils/errors';
import { BasePage } from '../base-page';

/**
 * Page object for the stacked gauge page.
 *
 * Provides the interactions the gauge spec needs: reaching the example,
 * activating MAIDR on it, and reading back the announcement, the braille
 * output and the text-mode state.
 */
export class GaugePlotPage extends BasePage {
  /**
   * Selectors for various UI elements
   */
  protected override readonly selectors = {
    notification: `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER} ${TestConstants.PARAGRAPH}`,
    info: `#${TestConstants.MAIDR_INFO_CONTAINER} ${TestConstants.PARAGRAPH}`,
    speedIndicator: `#${TestConstants.MAIDR_SPEED_INDICATOR}${TestConstants.GAUGE_ID}`,
    svg: `svg`,
    // The textarea's id ends with a React `useId()` suffix, so match on the
    // stable prefix rather than the whole id.
    braille: `textarea[id^="${TestConstants.BRAILLE_TEXTAREA}"]`,
    helpModal: TestConstants.MAIDR_HELP_MODAL,
    helpModalTitle: TestConstants.MAIDR_HELP_MODAL_TITLE,
    helpModalClose: TestConstants.HELP_MENU_CLOSE_BUTTON,
    settingsModal: TestConstants.MAIDR_SETTINGS_MODAL,
    chatModal: TestConstants.MAIDR_CHAT_MODAL,
  };

  /**
   * The ID of the gauge
   */
  private readonly plotId = TestConstants.GAUGE_ID;

  /**
   * Creates a new GaugePlotPage instance
   * @param page - The Playwright page object
   */
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigates to the gauge page
   * @throws GaugePlotError if navigation fails
   */
  public async navigateToGaugePlot(): Promise<void> {
    try {
      await super.navigateTo('examples/gauge.html');
      await super.verifyPlotLoaded(this.selectors.svg);
    } catch (error) {
      throw new GaugePlotError('Failed to navigate to gauge', { cause: error });
    }
  }

  /**
   * Activates MAIDR on the gauge
   * @throws GaugePlotError if MAIDR cannot be activated
   */
  public override async activateMaidr(): Promise<void> {
    try {
      await super.activateMaidr(this.selectors.svg, this.plotId);
    } catch (error) {
      throw new GaugePlotError('Failed to activate MAIDR', { cause: error });
    }
  }

  /**
   * Gets the instruction text displayed by MAIDR
   * @returns Promise resolving to the instruction text
   * @throws GaugePlotError if instruction text cannot be retrieved
   */
  public override async getInstructionText(): Promise<string> {
    try {
      return await super.getInstructionText(this.selectors.notification);
    } catch (error) {
      throw new GaugePlotError('Failed to get instruction text', { cause: error });
    }
  }

  /**
   * Verifies the plot has loaded correctly
   * @returns Promise resolving when verification is complete
   * @throws GaugePlotError if plot is not loaded correctly
   */
  public override async verifyPlotLoaded(): Promise<void> {
    try {
      await this.page.waitForLoadState('domcontentloaded');
      await expect(this.page.locator(this.selectors.svg)).toBeVisible({
        timeout: 10000,
      });
    } catch (error) {
      throw new GaugePlotError('Gauge failed to load correctly', { cause: error });
    }
  }

  /**
   * Reads the current contents of the braille display.
   *
   * Braille is the modality that fails silently for a new trace type — an
   * unregistered encoder leaves the display blank while text and audio still
   * work — so this returns the raw cell string for the spec to assert on.
   * @returns Promise resolving to the braille content, whitespace trimmed
   * @throws GaugePlotError if the braille display never appears
   */
  public async getBrailleContent(): Promise<string> {
    try {
      const textarea = await this.waitForElement(this.selectors.braille);
      return (await textarea.inputValue()).trim();
    } catch (error) {
      throw new GaugePlotError('Failed to read the braille display', { cause: error });
    }
  }

  /**
   * Checks if text mode is active
   * @param textMode - The text mode to check
   * @returns Promise resolving to true if text mode is active, false otherwise
   * @throws GaugePlotError if text mode status cannot be checked
   */
  public async isTextModeActive(textMode: string): Promise<boolean> {
    try {
      const modeMessages: Record<string, string> = {
        [TestConstants.TEXT_MODE_TERSE]: TestConstants.TEXT_MODE_TERSE_MESSAGE,
        [TestConstants.TEXT_MODE_VERBOSE]: TestConstants.TEXT_MODE_VERBOSE_MESSAGE,
        [TestConstants.TEXT_MODE_OFF]: TestConstants.TEXT_MODE_OFF_MESSAGE,
      };
      return await super.isModeActive(
        this.selectors.notification,
        textMode,
        modeMessages,
      );
    } catch (error) {
      throw new GaugePlotError('Failed to check text mode status', { cause: error });
    }
  }
}
