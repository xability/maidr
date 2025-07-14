import type { Page } from '@playwright/test';
import { TestConstants } from '../utils/constants';
import { MultiLayerPlotError } from '../utils/errors';
import { BasePage } from './base.page';

/**
 * Page object representing the Multi Layer plot page
 * Handles all Multi Layer plot specific interactions and verifications
 */
export class MultiLayerPlotPage extends BasePage {
  /**
   * Selectors for various UI elements
   */
  protected readonly selectors = {
    notification: `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER} ${TestConstants.PARAGRAPH}`,
    info: `#${TestConstants.MAIDR_INFO_CONTAINER} ${TestConstants.PARAGRAPH}`,
    speedIndicator: `#${TestConstants.MAIDR_SPEED_INDICATOR}${TestConstants.MULTI_LAYER_PLOT_ID}`,
    svg: `svg#${TestConstants.MULTI_LAYER_PLOT_ID}`,
    helpModal: TestConstants.MAIDR_HELP_MODAL,
    helpModalTitle: TestConstants.MAIDR_HELP_MODAL_TITLE,
    helpModalClose: TestConstants.HELP_MENU_CLOSE_BUTTON,
    settingsModal: TestConstants.MAIDR_SETTINGS_MODAL,
    chatModal: TestConstants.MAIDR_CHAT_MODAL,
  };

  /**
   * Creates a new MultiLayerPlotPage instance
   * @param page - The Playwright page object
   */
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigates to the Multi Layer Plot page
   * @returns Promise resolving when navigation completes
   * @throws MultiLayerPlotError if navigation fails
   */
  public async navigateToMultiLayerPlot(): Promise<void> {
    try {
      await super.navigateTo('examples/multi-layer.html');
      await super.verifyPlotLoaded(this.selectors.svg);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to navigate to Multi Layer Plot. ${error}`);
    }
  }

  /**
   * Activates MAIDR by focusing the plot
   * @returns Promise resolving when MAIDR is activated
   * @throws MultiLayerPlotError if MAIDR cannot be activated
   */
  public async activateMaidr(): Promise<void> {
    try {
      await super.activateMaidr(this.selectors.svg, TestConstants.MULTI_LAYER_PLOT_ID);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to activate MAIDR. ${error}`);
    }
  }

  /**
   * Activates MAIDR by clicking directly on the SVG element
   * @returns Promise resolving when MAIDR is activated via click
   * @throws MultiLayerPlotError if MAIDR cannot be activated by clicking
   */
  public async activateMaidrOnClick(): Promise<void> {
    try {
      await super.activateMaidrOnClick(this.selectors.svg, TestConstants.MULTI_LAYER_PLOT_ID);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to activate MAIDR by clicking. ${error}`);
    }
  }

  /**
   * Gets the instruction text displayed by MAIDR
   * @returns Promise resolving to the instruction text
   * @throws MultiLayerPlotError if instruction text cannot be retrieved
   */
  public async getInstructionText(): Promise<string> {
    try {
      return await super.getInstructionText(this.selectors.notification);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to get instruction text. ${error}`);
    }
  }

  /**
   * Checks if text mode is active
   * @param textMode - The text mode to check
   * @returns Promise resolving to true if text mode is active, false otherwise
   * @throws MultiLayerPlotError if text mode status cannot be checked
   */
  public async isTextModeActive(textMode: string): Promise<boolean> {
    try {
      const modeMessages: Record<string, string> = {
        [TestConstants.TEXT_MODE_TERSE]: TestConstants.TEXT_MODE_TERSE_MESSAGE,
        [TestConstants.TEXT_MODE_VERBOSE]: TestConstants.TEXT_MODE_VERBOSE_MESSAGE,
        [TestConstants.TEXT_MODE_OFF]: TestConstants.TEXT_MODE_OFF_MESSAGE,
      };
      return await super.isModeActive(this.selectors.notification, textMode, modeMessages);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to check text mode status. ${error}`);
    }
  }

  /**
   * Checks if braille mode is active
   * @param brailleMode - The braille mode to check
   * @returns Promise resolving to true if braille mode is active, false otherwise
   * @throws MultiLayerPlotError if braille mode status cannot be checked
   */
  public async isBrailleModeActive(brailleMode: string): Promise<boolean> {
    try {
      const modeMessages: Record<string, string> = {
        [TestConstants.BRAILLE_ON]: TestConstants.BRAILLE_MODE_ON,
        [TestConstants.BRAILLE_OFF]: TestConstants.BRAILLE_MODE_OFF,
      };
      return await super.isModeActive(this.selectors.notification, brailleMode, modeMessages);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to check braille mode status. ${error}`);
    }
  }

  /**
   * Checks if sonification mode is active
   * @param sonificationMode - The sonification mode to check
   * @returns Promise resolving to true if sonification mode is active, false otherwise
   * @throws MultiLayerPlotError if sonification mode status cannot be checked
   */
  public async isSonificationActive(sonificationMode: string): Promise<boolean> {
    try {
      const modeMessages: Record<string, string> = {
        [TestConstants.SOUND_ON]: TestConstants.SOUND_MODE_ON,
        [TestConstants.SOUND_OFF]: TestConstants.SOUND_MODE_OFF,
      };
      return await super.isModeActive(this.selectors.notification, sonificationMode, modeMessages);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to check sonification mode status. ${error}`);
    }
  }

  /**
   * Checks if review mode is active
   * @param reviewMode - The review mode to check
   * @returns Promise resolving to true if review mode is active, false otherwise
   * @throws MultiLayerPlotError if review mode status cannot be checked
   */
  public async isReviewModeActive(reviewMode: string): Promise<boolean> {
    try {
      const modeMessages: Record<string, string> = {
        [TestConstants.REVIEW_MODE_ON]: TestConstants.REVIEW_MODE_ON_MESSAGE,
        [TestConstants.REVIEW_MODE_OFF]: TestConstants.REVIEW_MODE_OFF_MESSAGE,
      };
      return await super.isModeActive(this.selectors.notification, reviewMode, modeMessages);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to check review mode status. ${error}`);
    }
  }

  /**
   * Gets the X-axis title
   * @returns Promise resolving to the X-axis title
   * @throws MultiLayerPlotError if X-axis title cannot be retrieved
   */
  public async getXAxisTitle(): Promise<string> {
    try {
      return await super.getAxisTitle(this.selectors.info);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to get X-axis title. ${error}`);
    }
  }

  /**
   * Gets the Y-axis title
   * @returns Promise resolving to the Y-axis title
   * @throws MultiLayerPlotError if Y-axis title cannot be retrieved
   */
  public async getYAxisTitle(): Promise<string> {
    try {
      return await super.getAxisTitle(this.selectors.info);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to get Y-axis title. ${error}`);
    }
  }

  /**
   * Gets the current playback speed
   * @returns Promise resolving to the current speed value
   * @throws MultiLayerPlotError if speed cannot be retrieved
   */
  public async getPlaybackSpeed(): Promise<number> {
    try {
      return await super.getPlaybackSpeed(this.selectors.speedIndicator);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to get playback speed. ${error}`);
    }
  }

  /**
   * Gets the current speed toggle information
   * @returns Promise resolving to the current speed toggle information
   * @throws MultiLayerPlotError if speed toggle information cannot be retrieved
   */
  public async getSpeedToggleInfo(): Promise<string> {
    try {
      return await this.getElementText(this.selectors.notification);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to get speed toggle information. ${error}`);
    }
  }

  /**
   * Gets the current data point information
   * @returns Promise resolving to the current data point information
   * @throws MultiLayerPlotError if data point information cannot be retrieved
   */
  public async getCurrentDataPointInfo(): Promise<string> {
    try {
      return await super.getCurrentDataPointInfo(this.selectors.info);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to get current data point information. ${error}`);
    }
  }

  /**
   * Starts forward autoplay
   * @param expectedContent - Expected content to wait for upon completion
   * @param options - Optional timeout configuration
   * @param options.timeout - Maximum time to wait in milliseconds (default: 10000)
   * @param options.pollInterval - Time between checks in milliseconds (default: 100)
   * @throws MultiLayerPlotError if autoplay fails
   */
  public async startForwardAutoplay(
    expectedContent?: string,
    options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<void> {
    try {
      await super.startAutoplay('forward', this.selectors.info, expectedContent, options);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to start forward autoplay. ${error}`);
    }
  }

  /**
   * Starts reverse autoplay
   * @param expectedContent - Expected content to wait for upon completion
   * @param options - Optional timeout configuration
   * @param options.timeout - Maximum time to wait in milliseconds (default: 10000)
   * @param options.pollInterval - Time between checks in milliseconds (default: 100)
   * @throws MultiLayerPlotError if autoplay fails
   */
  public async startReverseAutoplay(
    expectedContent?: string,
    options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<void> {
    try {
      await super.startAutoplay('reverse', this.selectors.info, expectedContent, options);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to start reverse autoplay. ${error}`);
    }
  }

  /**
   * Verifies the plot has loaded correctly
   * @returns Promise resolving when verification is complete
   * @throws MultiLayerPlotError if plot is not loaded correctly
   */
  public async verifyPlotLoaded(): Promise<void> {
    try {
      await super.verifyPlotLoaded(this.selectors.svg);
    } catch (error) {
      throw new MultiLayerPlotError(`Multi Layer Plot failed to load correctly. ${error}`);
    }
  }

  /**
   * Switches control to upper layer of a multi-layer plot
   * @throws MultiLayerPlotError if operation fails
   */
  public async switchToUpperLayer(): Promise<void> {
    try {
      await this.pressKey(TestConstants.PAGE_UP_KEY, 'switch to upper layer');
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to switch to upper layer. ${error}`);
    }
  }

  /**
   * Switches control to lower layer of a multi-layer plot
   * @throws MultiLayerPlotError if operation fails
   */
  public async switchToLowerLayer(): Promise<void> {
    try {
      await this.pressKey(TestConstants.PAGE_DOWN_KEY, 'switch to lower layer');
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to switch to lower layer. ${error}`);
    }
  }

  /**
   * Gets the information about current layer
   * @returns Promise resolving to the current layer information
   * @throws MultiLayerPlotError if layer information cannot be retrieved
   */
  public async getCurrentLayerInfo(): Promise<string> {
    try {
      return await this.getElementText(this.selectors.info);
    } catch (error) {
      throw new MultiLayerPlotError(`Failed to get current layer information. ${error}`);
    }
  }
}
