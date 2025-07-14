import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { TestConstants } from '../utils/constants';
import { LinePlotError } from '../utils/errors';
import { BasePage } from './base.page';

/**
 * Page object for the line plot page
 * Provides methods for interacting with the line plot
 */
export class LineplotPage extends BasePage {
  /**
   * Selectors for various UI elements
   */
  protected readonly selectors = {
    notification: `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER} ${TestConstants.PARAGRAPH}`,
    info: `#${TestConstants.MAIDR_INFO_CONTAINER} ${TestConstants.PARAGRAPH}`,
    speedIndicator: `#${TestConstants.MAIDR_SPEED_INDICATOR}${TestConstants.LINEPLOT_ID}`,
    svg: `svg#${TestConstants.LINEPLOT_ID}`,
    helpModal: TestConstants.MAIDR_HELP_MODAL,
    helpModalTitle: TestConstants.MAIDR_HELP_MODAL_TITLE,
    helpModalClose: TestConstants.HELP_MENU_CLOSE_BUTTON,
    settingsModal: TestConstants.MAIDR_SETTINGS_MODAL,
    chatModal: TestConstants.MAIDR_CHAT_MODAL,
  };

  /**
   * The ID of the line plot
   */
  private readonly plotId = TestConstants.LINEPLOT_ID;

  /**
   * Creates a new LineplotPage instance
   * @param page - The Playwright page object
   */
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigates to the line plot page
   * @throws LinePlotError if navigation fails
   */
  public async navigateToLinePlot(): Promise<void> {
    try {
      await super.navigateTo('examples/lineplot.html');
      await super.verifyPlotLoaded(this.selectors.svg);
    } catch (error) {
      throw new LinePlotError(`Failed to navigate to line plot. ${error}`);
    }
  }

  /**
   * Activates MAIDR on the line plot
   * @throws LinePlotError if MAIDR cannot be activated
   */
  public async activateMaidr(): Promise<void> {
    try {
      await super.activateMaidr(this.selectors.svg, this.plotId);
    } catch (error) {
      throw new LinePlotError(`Failed to activate MAIDR. ${error}`);
    }
  }

  /**
   * Activates MAIDR by clicking on the line plot
   * @throws LinePlotError if MAIDR cannot be activated by clicking
   */
  public async activateMaidrOnClick(): Promise<void> {
    try {
      await super.activateMaidrOnClick(this.selectors.svg, this.plotId);
    } catch (error) {
      throw new LinePlotError(`Failed to activate MAIDR by clicking. ${error}`);
    }
  }

  /**
   * Gets the instruction text displayed by MAIDR
   * @returns Promise resolving to the instruction text
   * @throws LinePlotError if instruction text cannot be retrieved
   */
  public async getInstructionText(): Promise<string> {
    try {
      return await super.getInstructionText(this.selectors.notification);
    } catch (error) {
      throw new LinePlotError(`Failed to get instruction text. ${error}`);
    }
  }

  /**
   * Checks if text mode is active
   * @param textMode - The text mode to check
   * @returns Promise resolving to true if text mode is active, false otherwise
   * @throws LinePlotError if text mode status cannot be checked
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
      throw new LinePlotError(`Failed to check text mode status. ${error}`);
    }
  }

  /**
   * Checks if braille mode is active
   * @param brailleMode - The braille mode to check
   * @returns Promise resolving to true if braille mode is active, false otherwise
   * @throws LinePlotError if braille mode status cannot be checked
   */
  public async isBrailleModeActive(brailleMode: string): Promise<boolean> {
    try {
      const modeMessages: Record<string, string> = {
        [TestConstants.BRAILLE_ON]: TestConstants.BRAILLE_MODE_ON,
        [TestConstants.BRAILLE_OFF]: TestConstants.BRAILLE_MODE_OFF,
      };
      return await super.isModeActive(
        this.selectors.notification,
        brailleMode,
        modeMessages,
      );
    } catch (error) {
      throw new LinePlotError(`Failed to check braille mode status. ${error}`);
    }
  }

  /**
   * Checks if sonification mode is active
   * @param sonificationMode - The sonification mode to check
   * @returns Promise resolving to true if sonification mode is active, false otherwise
   * @throws LinePlotError if sonification mode status cannot be checked
   */
  public async isSonificationActive(sonificationMode: string): Promise<boolean> {
    try {
      const modeMessages: Record<string, string> = {
        [TestConstants.SOUND_ON]: TestConstants.SOUND_MODE_ON,
        [TestConstants.SOUND_OFF]: TestConstants.SOUND_MODE_OFF,
      };
      return await super.isModeActive(
        this.selectors.notification,
        sonificationMode,
        modeMessages,
      );
    } catch (error) {
      throw new LinePlotError(`Failed to check sonification mode status. ${error}`);
    }
  }

  /**
   * Checks if review mode is active
   * @param reviewMode - The review mode to check
   * @returns Promise resolving to true if review mode is active, false otherwise
   * @throws LinePlotError if review mode status cannot be checked
   */
  public async isReviewModeActive(reviewMode: string): Promise<boolean> {
    try {
      const modeMessages: Record<string, string> = {
        [TestConstants.REVIEW_MODE_ON]: TestConstants.REVIEW_MODE_ON_MESSAGE,
        [TestConstants.REVIEW_MODE_OFF]: TestConstants.REVIEW_MODE_OFF_MESSAGE,
      };
      return await super.isModeActive(
        this.selectors.notification,
        reviewMode,
        modeMessages,
      );
    } catch (error) {
      throw new LinePlotError(`Failed to check review mode status. ${error}`);
    }
  }

  /**
   * Gets the X-axis title
   * @returns Promise resolving to the X-axis title
   * @throws LinePlotError if X-axis title cannot be retrieved
   */
  public async getXAxisTitle(): Promise<string> {
    try {
      return await super.getAxisTitle(this.selectors.info);
    } catch (error) {
      throw new LinePlotError(`Failed to get X-axis title. ${error}`);
    }
  }

  /**
   * Gets the Y-axis title
   * @returns Promise resolving to the Y-axis title
   * @throws LinePlotError if Y-axis title cannot be retrieved
   */
  public async getYAxisTitle(): Promise<string> {
    try {
      return await super.getAxisTitle(this.selectors.info);
    } catch (error) {
      throw new LinePlotError(`Failed to get Y-axis title. ${error}`);
    }
  }

  /**
   * Gets the current playback speed
   * @returns Promise resolving to the current speed value
   * @throws LinePlotError if speed cannot be retrieved
   */
  public async getPlaybackSpeed(): Promise<number> {
    try {
      return await super.getPlaybackSpeed(this.selectors.speedIndicator);
    } catch (error) {
      throw new LinePlotError(`Failed to get playback speed. ${error}`);
    }
  }

  /**
   * Gets the current data point information
   * @returns Promise resolving to the current data point information
   * @throws LinePlotError if data point information cannot be retrieved
   */
  public async getCurrentDataPointInfo(): Promise<string> {
    try {
      return await super.getCurrentDataPointInfo(this.selectors.info);
    } catch (error) {
      throw new LinePlotError(`Failed to get current data point information. ${error}`);
    }
  }

  /**
   * Starts forward autoplay
   * @param expectedContent - Expected content to wait for upon completion
   * @param options - Optional timeout configuration
   * @param options.timeout - Maximum time to wait in milliseconds (default: 10000)
   * @param options.pollInterval - Time between checks in milliseconds (default: 100)
   * @throws LinePlotError if autoplay fails
   */
  public async startForwardAutoplay(
    expectedContent?: string,
    options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<void> {
    try {
      await super.startAutoplay('forward', this.selectors.info, expectedContent, options);
    } catch (error) {
      throw new LinePlotError(`Failed to start forward autoplay. ${error}`);
    }
  }

  /**
   * Starts reverse autoplay
   * @param expectedContent - Expected content to wait for upon completion
   * @param options - Optional timeout configuration
   * @param options.timeout - Maximum time to wait in milliseconds (default: 10000)
   * @param options.pollInterval - Time between checks in milliseconds (default: 100)
   * @throws LinePlotError if autoplay fails
   */
  public async startReverseAutoplay(
    expectedContent?: string,
    options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<void> {
    try {
      await super.startAutoplay('reverse', this.selectors.info, expectedContent, options);
    } catch (error) {
      throw new LinePlotError(`Failed to start reverse autoplay. ${error}`);
    }
  }

  /**
   * Verifies the plot has loaded correctly
   * @returns Promise resolving when verification is complete
   * @throws LinePlotError if plot is not loaded correctly
   */
  public async verifyPlotLoaded(): Promise<void> {
    try {
      await this.page.waitForLoadState('domcontentloaded');
      await expect(this.page.locator(this.selectors.svg)).toBeVisible({
        timeout: 10000,
      });
    } catch (error) {
      throw new LinePlotError(`LinePlot plot failed to load correctly. ${error}`);
    }
  }

  /**
   * Get current speed toggle information
   * @returns current speed toggle information
   * @throws LinePlotError if speed toggle information cannot be retrieved
   */
  public async getSpeedToggleInfo(): Promise<string> {
    try {
      return await this.getElementText(this.selectors.notification);
    } catch (error) {
      throw new LinePlotError(`Failed to get speed toggle information. ${error}`);
    }
  }
}
