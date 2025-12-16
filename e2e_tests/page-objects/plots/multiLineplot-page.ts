import type { Page } from '@playwright/test';
import { TestConstants } from '../../utils/constants';
import { MultiLineplotError } from '../../utils/errors';
import { BasePage } from '../base-page';

/**
 * Page object representing the Multi Lineplot plot page
 * Handles all Multi Lineplot specific interactions and verifications
 */
export class MultiLineplotPage extends BasePage {
  /**
   * Selectors for various UI elements
   */
  protected readonly selectors = {
    notification: `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER} ${TestConstants.PARAGRAPH}`,
    info: `#${TestConstants.MAIDR_INFO_CONTAINER} ${TestConstants.PARAGRAPH}`,
    speedIndicator: `#${TestConstants.MAIDR_SPEED_INDICATOR}${TestConstants.MULTI_LINEPLOT_ID}`,
    svg: `svg`,
    helpModal: TestConstants.MAIDR_HELP_MODAL,
    helpModalTitle: TestConstants.MAIDR_HELP_MODAL_TITLE,
    helpModalClose: TestConstants.HELP_MENU_CLOSE_BUTTON,
    settingsModal: TestConstants.MAIDR_SETTINGS_MODAL,
    chatModal: TestConstants.MAIDR_CHAT_MODAL,
    rotor: `#${TestConstants.MAIDR_ROTOR_AREA}`,
  };

  /**
   * Creates a new MultiLineplotPage instance
   * @param page - The Playwright page object
   */
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigates to the Multi Lineplot plot page
   * @returns Promise resolving when navigation completes
   * @throws MultiLineplotError if navigation fails
   */
  public async navigateToLinePlot(): Promise<void> {
    try {
      await super.navigateTo('examples/multi-lineplot.html');
      await super.verifyPlotLoaded(this.selectors.svg);
    } catch (error) {
      throw new MultiLineplotError('Failed to navigate to Multi Lineplot');
    }
  }

  /**
   * Activates MAIDR by focusing the plot
   * @returns Promise resolving when MAIDR is activated
   * @throws MultiLineplotError if MAIDR cannot be activated
   */
  public async activateMaidr(): Promise<void> {
    try {
      await super.activateMaidr(this.selectors.svg, TestConstants.MULTI_LINEPLOT_ID);
    } catch (error) {
      throw new MultiLineplotError('Failed to activate MAIDR');
    }
  }

  /**
   * Activates MAIDR by clicking directly on the SVG element
   * @returns Promise resolving when MAIDR is activated via click
   * @throws MultiLineplotError if MAIDR cannot be activated by clicking
   */
  public async activateMaidrOnClick(): Promise<void> {
    try {
      await super.activateMaidrOnClick(this.selectors.svg, TestConstants.MULTI_LINEPLOT_ID);
    } catch (error) {
      throw new MultiLineplotError('Failed to activate MAIDR by clicking');
    }
  }

  /**
   * Gets the instruction text displayed by MAIDR
   * @returns Promise resolving to the instruction text
   * @throws MultiLineplotError if instruction text cannot be retrieved
   */
  public async getInstructionText(): Promise<string> {
    try {
      return await super.getInstructionText(this.selectors.notification);
    } catch (error) {
      throw new MultiLineplotError('Failed to get instruction text');
    }
  }

  /**
   * Checks if text mode is active
   * @param textMode - The text mode to check
   * @returns Promise resolving to true if text mode is active, false otherwise
   * @throws MultiLineplotError if text mode status cannot be checked
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
      throw new MultiLineplotError('Failed to check text mode status');
    }
  }

  /**
   * Checks if braille mode is active
   * @param brailleMode - The braille mode to check
   * @returns Promise resolving to true if braille mode is active, false otherwise
   * @throws MultiLineplotError if braille mode status cannot be checked
   */
  public async isBrailleModeActive(brailleMode: string): Promise<boolean> {
    try {
      const modeMessages: Record<string, string> = {
        [TestConstants.BRAILLE_ON]: TestConstants.BRAILLE_MODE_ON,
        [TestConstants.BRAILLE_OFF]: TestConstants.BRAILLE_MODE_OFF,
      };
      return await super.isModeActive(this.selectors.notification, brailleMode, modeMessages);
    } catch (error) {
      throw new MultiLineplotError('Failed to check braille mode status');
    }
  }

  /**
   * Checks if sonification mode is active
   * @param sonificationMode - The sonification mode to check
   * @returns Promise resolving to true if sonification mode is active, false otherwise
   * @throws MultiLineplotError if sonification mode status cannot be checked
   */
  public async isSonificationActive(sonificationMode: string): Promise<boolean> {
    try {
      const modeMessages: Record<string, string> = {
        [TestConstants.SOUND_ON]: TestConstants.SOUND_MODE_ON,
        [TestConstants.SOUND_OFF]: TestConstants.SOUND_MODE_OFF,
      };
      return await super.isModeActive(this.selectors.notification, sonificationMode, modeMessages);
    } catch (error) {
      throw new MultiLineplotError('Failed to check sonification mode status');
    }
  }

  /**
   * Checks if review mode is active
   * @param reviewMode - The review mode to check
   * @returns Promise resolving to true if review mode is active, false otherwise
   * @throws MultiLineplotError if review mode status cannot be checked
   */
  public async isReviewModeActive(reviewMode: string): Promise<boolean> {
    try {
      const modeMessages: Record<string, string> = {
        [TestConstants.REVIEW_MODE_ON]: TestConstants.REVIEW_MODE_ON_MESSAGE,
        [TestConstants.REVIEW_MODE_OFF]: TestConstants.REVIEW_MODE_OFF_MESSAGE,
      };
      return await super.isModeActive(this.selectors.notification, reviewMode, modeMessages);
    } catch (error) {
      throw new MultiLineplotError('Failed to check review mode status');
    }
  }

  /**
   * Gets the X-axis title
   * @returns Promise resolving to the X-axis title
   * @throws MultiLineplotError if X-axis title cannot be retrieved
   */
  public async getXAxisTitle(): Promise<string> {
    try {
      return await super.getAxisTitle(this.selectors.info);
    } catch (error) {
      throw new MultiLineplotError('Failed to get X-axis title');
    }
  }

  /**
   * Gets the Y-axis title
   * @returns Promise resolving to the Y-axis title
   * @throws MultiLineplotError if Y-axis title cannot be retrieved
   */
  public async getYAxisTitle(): Promise<string> {
    try {
      return await super.getAxisTitle(this.selectors.info);
    } catch (error) {
      throw new MultiLineplotError('Failed to get Y-axis title');
    }
  }

  /**
   * Gets the current playback speed
   * @returns Promise resolving to the current speed value
   * @throws MultiLineplotError if speed cannot be retrieved
   */
  public async getPlaybackSpeed(): Promise<number> {
    try {
      return await super.getPlaybackSpeed(this.selectors.speedIndicator);
    } catch (error) {
      throw new MultiLineplotError('Failed to get playback speed');
    }
  }

  /**
   * Gets the current data point information
   * @returns Promise resolving to the current data point information
   * @throws MultiLineplotError if data point information cannot be retrieved
   */
  public async getCurrentDataPointInfo(): Promise<string> {
    try {
      return await super.getCurrentDataPointInfo(this.selectors.info);
    } catch (error) {
      throw new MultiLineplotError('Failed to get current data point information');
    }
  }

  /**
   * Gets the current speed toggle information
   * @returns Promise resolving to the current speed toggle information
   * @throws MultiLineplotError if speed toggle information cannot be retrieved
   */
  public async getSpeedToggleInfo(): Promise<string> {
    try {
      return await this.getElementText(this.selectors.notification);
    } catch (error) {
      throw new MultiLineplotError('Failed to get speed toggle information');
    }
  }

  /**
   * Starts forward autoplay
   * @param expectedContent - Expected content to wait for upon completion
   * @param options - Optional timeout configuration
   * @param options.timeout - Maximum time to wait in milliseconds (default: 10000)
   * @param options.pollInterval - Time between checks in milliseconds (default: 100)
   * @throws MultiLineplotError if autoplay fails
   */
  public async startForwardAutoplay(
    expectedContent?: string,
    options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<void> {
    try {
      await super.startAutoplay('forward', this.selectors.info, expectedContent, options);
    } catch (error) {
      throw new MultiLineplotError('Failed to start forward autoplay');
    }
  }

  /**
   * Starts reverse autoplay
   * @param expectedContent - Expected content to wait for upon completion
   * @param options - Optional timeout configuration
   * @param options.timeout - Maximum time to wait in milliseconds (default: 10000)
   * @param options.pollInterval - Time between checks in milliseconds (default: 100)
   * @throws MultiLineplotError if autoplay fails
   */
  public async startReverseAutoplay(
    expectedContent?: string,
    options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<void> {
    try {
      await super.startAutoplay('reverse', this.selectors.info, expectedContent, options);
    } catch (error) {
      throw new MultiLineplotError('Failed to start reverse autoplay');
    }
  }

  /**
   * Verifies the plot has loaded correctly
   * @returns Promise resolving when verification is complete
   * @throws MultiLineplotError if plot is not loaded correctly
   */
  public async verifyPlotLoaded(): Promise<void> {
    try {
      await super.verifyPlotLoaded(this.selectors.svg);
    } catch (error) {
      throw new MultiLineplotError('Multi Lineplot failed to load correctly');
    }
  }

  // =====================
  // Rotor Navigation Methods
  // =====================

  /**
   * Moves to the next rotor navigation mode using Alt+Shift+Up
   * Cycles through: DATA POINT NAVIGATION -> LOWER VALUE NAVIGATION -> HIGHER VALUE NAVIGATION
   * @returns Promise resolving when the mode has changed
   * @throws MultiLineplotError if rotor navigation fails
   */
  public async moveToNextRotorMode(): Promise<void> {
    try {
      await this.page.keyboard.down(TestConstants.ALT_KEY);
      await this.page.keyboard.down(TestConstants.SHIFT_KEY);
      await this.pressKey(TestConstants.UP_ARROW_KEY, 'move to next rotor mode');
      await this.page.keyboard.up(TestConstants.SHIFT_KEY);
      await this.page.keyboard.up(TestConstants.ALT_KEY);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MultiLineplotError(`Failed to move to next rotor mode: ${errorMessage}`);
    }
  }

  /**
   * Moves to the previous rotor navigation mode using Alt+Shift+Down
   * Cycles through: HIGHER VALUE NAVIGATION -> LOWER VALUE NAVIGATION -> DATA POINT NAVIGATION
   * @returns Promise resolving when the mode has changed
   * @throws MultiLineplotError if rotor navigation fails
   */
  public async moveToPrevRotorMode(): Promise<void> {
    try {
      await this.page.keyboard.down(TestConstants.ALT_KEY);
      await this.page.keyboard.down(TestConstants.SHIFT_KEY);
      await this.pressKey(TestConstants.DOWN_ARROW_KEY, 'move to previous rotor mode');
      await this.page.keyboard.up(TestConstants.SHIFT_KEY);
      await this.page.keyboard.up(TestConstants.ALT_KEY);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MultiLineplotError(`Failed to move to previous rotor mode: ${errorMessage}`);
    }
  }

  /**
   * Gets the current rotor mode from the notification text
   * @returns Promise resolving to the current rotor mode message
   * @throws MultiLineplotError if mode cannot be retrieved
   */
  public async getCurrentRotorMode(): Promise<string> {
    return this.getInstructionText();
  }

  /**
   * Checks if the current rotor mode matches the expected mode
   * @param expectedMode - The expected rotor mode (DATA POINT NAVIGATION, LOWER VALUE NAVIGATION, or HIGHER VALUE NAVIGATION)
   * @returns Promise resolving to true if the current mode matches, false otherwise
   */
  public async isRotorModeActive(expectedMode: string): Promise<boolean> {
    const text = await this.getElementText(this.selectors.rotor);
    return text === expectedMode;
  }

  /**
   * Navigates to a specific rotor mode by cycling through modes
   * @param targetMode - The target rotor mode to navigate to
   * @throws MultiLineplotError if navigation fails
   */
  public async navigateToRotorMode(targetMode: string): Promise<void> {
    const maxAttempts = 4;
    for (let i = 0; i < maxAttempts; i++) {
      const currentMode = await this.getCurrentRotorMode();
      if (currentMode === targetMode) {
        return;
      }
      await this.moveToNextRotorMode();
    }
    throw new MultiLineplotError(`Failed to navigate to rotor mode: ${targetMode}`);
  }

  // =====================
  // Go To Extrema Methods
  // =====================

  /**
   * Opens the Go To Extrema modal by pressing 'g' key
   * @returns Promise resolving when the modal is opened
   * @throws MultiLineplotError if modal fails to open
   */
  public async openGoToExtremaModal(): Promise<void> {
    try {
      await this.pressKey(TestConstants.GO_TO_EXTREMA_KEY, 'open go to extrema modal');
      // Wait for the modal to appear
      await this.page.waitForSelector(TestConstants.GO_TO_EXTREMA_MODAL, { timeout: 5000 });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MultiLineplotError(`Failed to open Go To Extrema modal: ${errorMessage}`);
    }
  }

  /**
   * Closes the Go To Extrema modal by pressing 'Escape' key
   * @returns Promise resolving when the modal is closed
   * @throws MultiLineplotError if modal fails to close
   */
  public async closeGoToExtremaModal(): Promise<void> {
    try {
      await this.pressKey(TestConstants.ESCAPE_KEY, 'close go to extrema modal');
      // Wait for the modal to disappear
      await this.page.waitForSelector(TestConstants.GO_TO_EXTREMA_MODAL, { state: 'hidden', timeout: 5000 });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MultiLineplotError(`Failed to close Go To Extrema modal: ${errorMessage}`);
    }
  }

  /**
   * Checks if the Go To Extrema modal is visible
   * @returns Promise resolving to true if the modal is visible, false otherwise
   */
  public async isGoToExtremaModalVisible(): Promise<boolean> {
    try {
      const modal = await this.page.$(TestConstants.GO_TO_EXTREMA_MODAL);
      return modal !== null;
    } catch {
      return false;
    }
  }

  /**
   * Moves selection up in the Go To Extrema modal
   * @returns Promise resolving when navigation completes
   */
  public async goToExtremaMoveUp(): Promise<void> {
    await this.pressKey(TestConstants.UP_ARROW_KEY, 'go to extrema move up');
  }

  /**
   * Moves selection down in the Go To Extrema modal
   * @returns Promise resolving when navigation completes
   */
  public async goToExtremaMoveDown(): Promise<void> {
    await this.pressKey(TestConstants.DOWN_ARROW_KEY, 'go to extrema move down');
  }

  /**
   * Selects the currently highlighted extrema target by pressing Enter
   * @returns Promise resolving when selection is made
   * @throws MultiLineplotError if selection fails
   */
  public async selectExtremaTarget(): Promise<void> {
    try {
      await this.pressKey(TestConstants.ENTER_KEY, 'select extrema target');
      // Wait for modal to close after selection
      await this.page.waitForSelector(TestConstants.GO_TO_EXTREMA_MODAL, { state: 'hidden', timeout: 5000 });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MultiLineplotError(`Failed to select extrema target: ${errorMessage}`);
    }
  }

  /**
   * Gets all available extrema targets from the modal
   * @returns Promise resolving to an array of extrema target labels
   * @throws MultiLineplotError if unable to get targets
   */
  public async getExtremaTargets(): Promise<string[]> {
    try {
      const targets: string[] = [];
      let index = 0;

      // Iterate through extrema-target-0, extrema-target-1, etc.
      while (true) {
        const targetElement = await this.page.$(`#extrema-target-${index}`);
        if (!targetElement) {
          break;
        }
        const text = await targetElement.textContent();
        targets.push(text || '');
        index++;
      }

      return targets;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MultiLineplotError(`Failed to get extrema targets: ${errorMessage}`);
    }
  }

  /**
   * Gets the currently selected extrema target in the modal
   * @returns Promise resolving to the selected target label
   * @throws MultiLineplotError if unable to get selected target
   */
  public async getSelectedExtremaTarget(): Promise<string> {
    try {
      // Find the selected extrema target div by checking for data-selected or aria-selected
      let index = 0;
      while (true) {
        const targetElement = await this.page.$(`#extrema-target-${index}`);
        if (!targetElement) {
          break;
        }
        const isSelected = await targetElement.getAttribute('data-selected');
        const ariaSelected = await targetElement.getAttribute('aria-selected');
        if (isSelected === 'true' || ariaSelected === 'true') {
          return (await targetElement.textContent()) || '';
        }
        index++;
      }
      return '';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MultiLineplotError(`Failed to get selected extrema target: ${errorMessage}`);
    }
  }

  /**
   * Navigates to the maximum value using Go To Extrema
   * Opens the modal, selects Maximum, and confirms
   * @returns Promise resolving when navigation to maximum is complete
   * @throws MultiLineplotError if navigation fails
   */
  public async goToMaximum(): Promise<void> {
    try {
      await this.openGoToExtremaModal();
      // Maximum is typically the first option, so just select it
      await this.selectExtremaTarget();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MultiLineplotError(`Failed to navigate to maximum: ${errorMessage}`);
    }
  }

  /**
   * Navigates to the minimum value using Go To Extrema
   * Opens the modal, navigates to Minimum, and confirms
   * @returns Promise resolving when navigation to minimum is complete
   * @throws MultiLineplotError if navigation fails
   */
  public async goToMinimum(): Promise<void> {
    try {
      await this.openGoToExtremaModal();
      // Move down to select Minimum (assuming Maximum is first)
      await this.goToExtremaMoveDown();
      await this.selectExtremaTarget();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MultiLineplotError(`Failed to navigate to minimum: ${errorMessage}`);
    }
  }
}
