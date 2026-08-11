import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { TestConstants } from '../../utils/constants';
import { BarPlotError } from '../../utils/errors';
import { normalizeText } from '../../utils/text';
import { BasePage } from '../base-page';

/**
 * Page object representing the bar plot page
 * Handles all bar plot specific interactions and verifications
 */
export class BarPlotPage extends BasePage {
  /**
   * The ID of the plot being tested
   */
  private readonly plotId: string;

  /**
   * Selectors for various UI elements
   */
  protected override readonly selectors: {
    notification: string;
    info: string;
    speedIndicator: string;
    svg: string;
    helpModal: string;
    helpModalTitle: string;
    helpModalClose: string;
    settingsModal: string;
    chatModal: string;
  };

  /**
   * Creates a new BarPlotPage instance
   * @param page - The Playwright page object
   * @param plotId - ID of the bar plot (defaults to BAR_ID constant)
   */
  constructor(page: Page, plotId: string = TestConstants.BAR_ID) {
    super(page);
    this.plotId = plotId;
    this.selectors = {
      notification: `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER} ${TestConstants.PARAGRAPH}`,
      info: `#${TestConstants.MAIDR_INFO_CONTAINER} ${TestConstants.PARAGRAPH}`,
      speedIndicator: `#${TestConstants.MAIDR_SPEED_INDICATOR + this.plotId}`,
      svg: `svg#${this.plotId}`,
      helpModal: TestConstants.MAIDR_HELP_MODAL,
      helpModalTitle: TestConstants.MAIDR_HELP_MODAL_TITLE,
      helpModalClose: TestConstants.HELP_MENU_CLOSE_BUTTON,
      settingsModal: TestConstants.MAIDR_SETTINGS_MODAL,
      chatModal: TestConstants.MAIDR_CHAT_MODAL,
    };
  }

  /**
   * Navigates to the bar plot page
   * @returns Promise resolving when navigation completes
   * @throws BarPlotError if navigation fails
   */
  public async navigateToBarPlot(): Promise<void> {
    try {
      await this.navigateTo('/examples/barplot.html');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to navigate to bar plot: ${errorMessage}`, { cause: error });
    }
  }

  /**
   * Waits for an element to contain specific content
   * @param selector - CSS selector for the target element
   * @param expectedContent - The expected text content to wait for
   * @param options - Configuration options for the wait operation
   * @param options.timeout - Maximum time to wait for content in milliseconds
   * @param options.pollInterval - Time between content checks in milliseconds
   * @returns Promise resolving when the condition is met
   * @throws BarPlotError if timeout is reached before the condition is met
   */
  public override async waitForElementContent(
    selector: string,
    expectedContent: string,
    options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<void> {
    const timeout = options.timeout || 10000;
    const pollInterval = options.pollInterval || 100;

    try {
      await this.page.waitForSelector(selector, { timeout: Math.min(5000, timeout / 2) });

      await this.page.waitForFunction(
        ({ selector, expectedContent }) => {
          const element = document.querySelector(selector);
          return element && element.textContent?.includes(expectedContent);
        },
        { selector, expectedContent },
        { timeout, polling: pollInterval },
      );
    } catch (error) {
      let actualContent = '';
      try {
        actualContent = await this.page.$eval(selector, el => el.textContent || '');
      } catch {
        actualContent = 'Element not found';
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(
        `Timeout waiting for element "${selector}" to have content "${expectedContent}". `
        + `Actual content: "${actualContent}". ${errorMessage}`,
        { cause: error },
      );
    }
  }

  /**
   * Verifies the plot has loaded correctly
   * @returns Promise resolving when verification is complete
   * @throws BarPlotError if plot is not loaded correctly
   */
  public override async verifyPlotLoaded(): Promise<void> {
    try {
      await this.page.waitForLoadState('domcontentloaded');
      await expect(this.page.locator(this.selectors.svg)).toBeVisible({
        timeout: 10000,
      });
    } catch (error) {
      throw new BarPlotError('Bar plot failed to load correctly', { cause: error });
    }
  }

  /**
   * Activates MAIDR by focusing the plot
   * @returns Promise resolving when MAIDR is activated
   * @throws BarPlotError if MAIDR cannot be activated
   */
  public override async activateMaidr(): Promise<void> {
    try {
      await this.verifyPlotLoaded();
      await this.pressKey(TestConstants.TAB_KEY, 'activate maidr');
      await this.verifySvgFocused();
    } catch (error) {
      throw new BarPlotError('Failed to activate MAIDR', { cause: error });
    }
  }

  /**
   * Activates MAIDR by clicking directly on the SVG element
   * @returns Promise resolving when MAIDR is activated via click
   * @throws BarPlotError if MAIDR cannot be activated by clicking
   */
  public override async activateMaidrOnClick(): Promise<void> {
    try {
      await this.verifyPlotLoaded();
      await this.page.click(this.selectors.svg);
      await this.verifySvgFocused();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to activate MAIDR by clicking: ${errorMessage}`, { cause: error });
    }
  }

  /**
   * Gets text content from the notification container
   * @returns Promise resolving to the notification text
   * @throws BarPlotError if text cannot be retrieved
   */
  private async getNotificationText(): Promise<string> {
    try {
      const text = await this.getElementText(this.selectors.notification);
      return normalizeText(text);
    } catch (error) {
      throw new BarPlotError('Failed to get notification text', { cause: error });
    }
  }

  /**
   * Gets the instruction text displayed by MAIDR
   * @returns Promise resolving to the instruction text
   * @throws BarPlotError if instruction text cannot be retrieved
   */
  public override async getInstructionText(): Promise<string> {
    return this.getNotificationText();
  }

  /**
   * Checks if a specific mode is active based on expected message
   *
   * Deliberately NOT named `isModeActive`: that would override the base
   * method with an incompatible parameter list, which is how the barplot
   * toggles previously ended up bypassing the base class's wait entirely.
   * A different name means a future change to the base signature cannot
   * silently miss this one.
   * @param mode - The mode to check
   * @param expectedMessage - The expected message for the mode
   * @returns Promise resolving to true if mode is active, false otherwise
   * @throws BarPlotError if mode status cannot be checked
   */
  protected async isModeMessageActive(mode: string, expectedMessage: string): Promise<boolean> {
    try {
      // Delegate rather than read the notification directly: the base
      // implementation waits for the announcement before comparing, and a
      // second snapshot-reading copy here would keep the barplot toggles
      // exposed to the live-region race the base class exists to avoid.
      return await super.isModeActive(this.selectors.notification, mode, {
        [mode]: expectedMessage,
      });
    } catch (error) {
      throw new BarPlotError(`Failed to check ${mode} status`, { cause: error });
    }
  }

  /**
   * Checks if text mode is active
   * @returns Promise resolving to true if text mode is active, false otherwise
   */
  public async isTextModeActive(textMode: string): Promise<boolean> {
    const modeMessages: Record<string, string> = {
      [TestConstants.TEXT_MODE_TERSE]: TestConstants.TEXT_MODE_TERSE_MESSAGE,
      [TestConstants.TEXT_MODE_VERBOSE]: TestConstants.TEXT_MODE_VERBOSE_MESSAGE,
      [TestConstants.TEXT_MODE_OFF]: TestConstants.TEXT_MODE_OFF_MESSAGE,
    };

    if (!(textMode in modeMessages)) {
      throw new BarPlotError('Invalid text mode specified');
    }

    return this.isModeMessageActive('text', modeMessages[textMode]);
  }

  /**
   * Checks if braille mode is active
   * @returns Promise resolving to true if braille mode is active, false otherwise
   */
  public async isBrailleModeActive(brailleMode: string): Promise<boolean> {
    const modeMessages: Record<string, string> = {
      [TestConstants.BRAILLE_ON]: TestConstants.BRAILLE_MODE_ON,
      [TestConstants.BRAILLE_OFF]: TestConstants.BRAILLE_MODE_OFF,
    };

    if (!(brailleMode in modeMessages)) {
      throw new BarPlotError('Invalid braille mode specified');
    }

    return this.isModeMessageActive('braille', modeMessages[brailleMode]);
  }

  /**
   * Checks if sonification is active
   * @returns Promise resolving to true if sonification is active, false otherwise
   */
  public async isSonificationActive(sonificationMode: string): Promise<boolean> {
    const modeMessages: Record<string, string> = {
      [TestConstants.SOUND_ON]: TestConstants.SOUND_MODE_ON,
      [TestConstants.SOUND_OFF]: TestConstants.SOUND_MODE_OFF,
    };

    if (!(sonificationMode in modeMessages)) {
      throw new BarPlotError('Invalid sonification mode specified');
    }

    return this.isModeMessageActive('sonification', modeMessages[sonificationMode]);
  }

  /**
   * Checks if review mode is active
   * @returns Promise resolving to true if review mode is active, false otherwise
   */
  public async isReviewModeActive(reviewMode: string): Promise<boolean> {
    const modeMessages: Record<string, string> = {
      [TestConstants.REVIEW_MODE_ON]: TestConstants.REVIEW_MODE_ON_MESSAGE,
      [TestConstants.REVIEW_MODE_OFF]: TestConstants.REVIEW_MODE_OFF_MESSAGE,
    };

    if (!(reviewMode in modeMessages)) {
      throw new BarPlotError('Invalid review mode specified');
    }

    return this.isModeMessageActive('review', modeMessages[reviewMode]);
  }

  /**
   * Gets text content from the info container
   * @returns Promise resolving to the info text
   * @throws BarPlotError if text cannot be retrieved
   */
  private async getInfoText(): Promise<string> {
    try {
      return await this.getElementText(this.selectors.info);
    } catch (error) {
      throw new BarPlotError('Failed to get info text', { cause: error });
    }
  }

  /**
   * Get X-Axis title
   * @returns X-axis title text
   * @throws BarPlotError if title cannot be retrieved
   */
  public async getXAxisTitle(): Promise<string> {
    return this.getInfoText();
  }

  /**
   * Get Y-Axis title
   * @returns Y-axis title text
   * @throws BarPlotError if title cannot be retrieved
   */
  public async getYAxisTitle(): Promise<string> {
    return this.getInfoText();
  }

  /**
   * Gets the current playback speed
   * @returns Promise resolving to the current speed value
   * @throws BarPlotError if speed cannot be retrieved
   */
  public override async getPlaybackSpeed(): Promise<number> {
    try {
      const speedText = await this.getElementText(this.selectors.speedIndicator);
      return Number.parseFloat(speedText);
    } catch (error) {
      throw new BarPlotError('Failed to get playback speed', { cause: error });
    }
  }

  /**
   * Get current speed toggle information
   * @returns current speed toggle information
   * @throws BarPlotError if speed toggle information cannot be retrieved
   */
  public async getSpeedToggleInfo(): Promise<string> {
    return this.getNotificationText();
  }

  /**
   * Get the current data point information
   * @returns Promise resolving to the current data point information
   * @throws BarPlotError if data point information cannot be retrieved
   */
  public override async getCurrentDataPointInfo(): Promise<string> {
    return this.getInfoText();
  }

  /**
   * Starts forward autoplay and waits for completion
   * @param expectedContent - Expected content to wait for upon completion
   * @param options - Optional timeout configuration
   * @param options.timeout - Maximum time to wait in milliseconds (default: 10000)
   * @param options.pollInterval - Time between checks in milliseconds (default: 100)
   * @returns Promise resolving when autoplay completes and expected content is displayed
   * @throws BarPlotError if autoplay fails or times out
   */
  public async startForwardAutoplay(
    expectedContent?: string,
    options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<void> {
    try {
      await super.startAutoplay('forward', this.selectors.info, expectedContent, options);
    } catch (error) {
      throw new BarPlotError('Failed to start forward autoplay', { cause: error });
    }
  }

  /**
   * Starts reverse autoplay and waits for completion
   * @param expectedContent - Expected content to wait for upon completion
   * @param options - Optional timeout configuration
   * @param options.timeout - Maximum time to wait in milliseconds (default: 10000)
   * @param options.pollInterval - Time between checks in milliseconds (default: 100)
   * @returns Promise resolving when autoplay completes and expected content is displayed
   * @throws BarPlotError if autoplay fails or times out
   */
  public async startReverseAutoplay(
    expectedContent?: string,
    options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<void> {
    try {
      await super.startAutoplay('reverse', this.selectors.info, expectedContent, options);
    } catch (error) {
      throw new BarPlotError('Failed to start reverse autoplay', { cause: error });
    }
  }
}
