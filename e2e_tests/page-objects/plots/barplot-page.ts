import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { TestConstants } from '../../utils/constants';
import { BarPlotError } from '../../utils/errors';
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
  protected readonly selectors: {
    notification: string;
    info: string;
    speedIndicator: string;
    svg: string;
    helpModal: string;
    helpModalTitle: string;
    helpModalClose: string;
    settingsModal: string;
    chatModal: string;
    rotor: string;
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
      rotor: `#${TestConstants.MAIDR_ROTOR_AREA}`,
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
      throw new BarPlotError(`Failed to navigate to bar plot: ${errorMessage}`);
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
  public async waitForElementContent(
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
      );
    }
  }

  /**
   * Verifies the plot has loaded correctly
   * @returns Promise resolving when verification is complete
   * @throws BarPlotError if plot is not loaded correctly
   */
  public async verifyPlotLoaded(): Promise<void> {
    try {
      await this.page.waitForLoadState('domcontentloaded');
      await expect(this.page.locator(this.selectors.svg)).toBeVisible({
        timeout: 10000,
      });
    } catch (error) {
      throw new BarPlotError('Bar plot failed to load correctly');
    }
  }

  /**
   * Verifies that the SVG element is focused
   * @throws Error if SVG element is not focused
   */
  protected async verifySvgFocused(): Promise<void> {
    const activeElementInfo = await this.getActiveElementInfo();
    if (activeElementInfo.tagName !== 'svg') {
      throw new Error(
        `Expected SVG element to be focused, `
        + `but found ${activeElementInfo.tagName} instead"`,
      );
    }
  }

  /**
   * Activates MAIDR by focusing the plot
   * @returns Promise resolving when MAIDR is activated
   * @throws BarPlotError if MAIDR cannot be activated
   */
  public async activateMaidr(): Promise<void> {
    try {
      await this.verifyPlotLoaded();
      await this.page.keyboard.press(TestConstants.TAB_KEY);
      await this.verifySvgFocused();
    } catch (error) {
      throw new BarPlotError('Failed to activate MAIDR');
    }
  }

  /**
   * Activates MAIDR by clicking directly on the SVG element
   * @returns Promise resolving when MAIDR is activated via click
   * @throws BarPlotError if MAIDR cannot be activated by clicking
   */
  public async activateMaidrOnClick(): Promise<void> {
    try {
      await this.verifyPlotLoaded();
      await this.page.click(this.selectors.svg);
      await this.verifySvgFocused();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to activate MAIDR by clicking: ${errorMessage}`);
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
      return text.replace(/\s+/g, ' ').trim();
    } catch (error) {
      throw new BarPlotError('Failed to get notification text');
    }
  }

  /**
   * Gets the instruction text displayed by MAIDR
   * @returns Promise resolving to the instruction text
   * @throws BarPlotError if instruction text cannot be retrieved
   */
  public async getInstructionText(): Promise<string> {
    return this.getNotificationText();
  }

  /**
   * Checks if a specific mode is active based on expected message
   * @param mode - The mode to check
   * @param expectedMessage - The expected message for the mode
   * @returns Promise resolving to true if mode is active, false otherwise
   * @throws BarPlotError if mode status cannot be checked
   */
  protected async isModeActive(mode: string, expectedMessage: string): Promise<boolean> {
    try {
      const notificationText = await this.getNotificationText();
      return notificationText === expectedMessage;
    } catch (error) {
      throw new BarPlotError(`Failed to check ${mode} status`);
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

    return this.isModeActive('text', modeMessages[textMode]);
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

    return this.isModeActive('braille', modeMessages[brailleMode]);
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

    return this.isModeActive('sonification', modeMessages[sonificationMode]);
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

    return this.isModeActive('review', modeMessages[reviewMode]);
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
      throw new BarPlotError('Failed to get info text');
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
  public async getPlaybackSpeed(): Promise<number> {
    try {
      const speedText = await this.getElementText(this.selectors.speedIndicator);
      return Number.parseFloat(speedText);
    } catch (error) {
      throw new BarPlotError('Failed to get playback speed');
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
  public async getCurrentDataPointInfo(): Promise<string> {
    return this.getInfoText();
  }

  /**
   * Starts autoplay in a specific direction
   * @param direction - The direction to autoplay ('forward' or 'reverse')
   * @param infoSelector - The selector for the info element
   * @param expectedContent - Expected content to wait for upon completion
   * @param options - Optional timeout configuration
   * @param options.timeout - Maximum time to wait in milliseconds (default: 10000)
   * @param options.pollInterval - Time between checks in milliseconds (default: 100)
   * @returns Promise resolving when autoplay completes and expected content is displayed
   * @throws BarPlotError if autoplay fails or times out
   */
  protected async startAutoplay(
    direction: 'forward' | 'reverse',
    infoSelector: string,
    expectedContent?: string,
    options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<void> {
    const arrowKey = direction === 'forward' ? TestConstants.RIGHT_ARROW_KEY : TestConstants.LEFT_ARROW_KEY;
    const directionName = direction === 'forward' ? 'forward' : 'reverse';

    try {
      await this.page.keyboard.down(TestConstants.META_KEY);
      await this.page.keyboard.down(TestConstants.SHIFT_KEY);
      await this.pressKey(arrowKey, `start ${directionName} autoplay`);

      await this.page.keyboard.up(TestConstants.META_KEY);
      await this.page.keyboard.up(TestConstants.SHIFT_KEY);
      await this.page.keyboard.up(arrowKey);

      if (expectedContent) {
        await this.waitForElementContent(
          infoSelector,
          expectedContent,
          options,
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to complete ${directionName} autoplay: ${errorMessage}`);
    }
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
    await this.startAutoplay('forward', this.selectors.info, expectedContent, options);
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
    await this.startAutoplay('reverse', this.selectors.info, expectedContent, options);
  }

  // =====================
  // Rotor Navigation Methods
  // =====================

  /**
   * Moves to the next rotor navigation mode using Alt+Shift+Up
   * Cycles through: DATA POINT NAVIGATION -> LOWER VALUE NAVIGATION -> HIGHER VALUE NAVIGATION
   * @returns Promise resolving when the mode has changed
   * @throws BarPlotError if rotor navigation fails
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
      throw new BarPlotError(`Failed to move to next rotor mode: ${errorMessage}`);
    }
  }

  /**
   * Moves to the previous rotor navigation mode using Alt+Shift+Down
   * Cycles through: HIGHER VALUE NAVIGATION -> LOWER VALUE NAVIGATION -> DATA POINT NAVIGATION
   * @returns Promise resolving when the mode has changed
   * @throws BarPlotError if rotor navigation fails
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
      throw new BarPlotError(`Failed to move to previous rotor mode: ${errorMessage}`);
    }
  }

  /**
   * Gets the current rotor mode from the notification text
   * @returns Promise resolving to the current rotor mode message
   * @throws BarPlotError if mode cannot be retrieved
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
   * @throws BarPlotError if navigation fails
   */
  public async navigateToRotorMode(targetMode: string): Promise<void> {
    const maxAttempts = 4; // Maximum cycles to find the target mode
    for (let i = 0; i < maxAttempts; i++) {
      const currentMode = await this.getCurrentRotorMode();
      if (currentMode === targetMode) {
        return;
      }
      await this.moveToNextRotorMode();
    }
    throw new BarPlotError(`Failed to navigate to rotor mode: ${targetMode}`);
  }

  /**
   * In rotor mode, moves to the next data point in the current navigation direction
   * For LOWER VALUE mode: finds next lower value to the right
   * For HIGHER VALUE mode: finds next higher value to the right
   * @returns Promise resolving when navigation completes
   * @throws BarPlotError if navigation fails
   */
  public async rotorMoveRight(): Promise<void> {
    await this.pressKey(TestConstants.RIGHT_ARROW_KEY, 'rotor move right');
  }

  /**
   * In rotor mode, moves to the previous data point in the current navigation direction
   * For LOWER VALUE mode: finds next lower value to the left
   * For HIGHER VALUE mode: finds next higher value to the left
   * @returns Promise resolving when navigation completes
   * @throws BarPlotError if navigation fails
   */
  public async rotorMoveLeft(): Promise<void> {
    await this.pressKey(TestConstants.LEFT_ARROW_KEY, 'rotor move left');
  }

  // =====================
  // Go To Extrema Methods
  // =====================

  /**
   * Opens the Go To Extrema modal by pressing 'g' key
   * @returns Promise resolving when the modal is opened
   * @throws BarPlotError if modal fails to open
   */
  public async openGoToExtremaModal(): Promise<void> {
    try {
      await this.pressKey(TestConstants.GO_TO_EXTREMA_KEY, 'open go to extrema modal');
      // Wait for the modal to appear
      await this.page.waitForSelector(TestConstants.GO_TO_EXTREMA_MODAL, { timeout: 5000 });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to open Go To Extrema modal: ${errorMessage}`);
    }
  }

  /**
   * Closes the Go To Extrema modal by pressing 'Escape' or 'g' key
   * @returns Promise resolving when the modal is closed
   * @throws BarPlotError if modal fails to close
   */
  public async closeGoToExtremaModal(): Promise<void> {
    try {
      await this.pressKey(TestConstants.ESCAPE_KEY, 'close go to extrema modal');
      // Wait for the modal to disappear
      await this.page.waitForSelector(TestConstants.GO_TO_EXTREMA_MODAL, { state: 'hidden', timeout: 5000 });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to close Go To Extrema modal: ${errorMessage}`);
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
   * @throws BarPlotError if selection fails
   */
  public async selectExtremaTarget(): Promise<void> {
    try {
      await this.pressKey(TestConstants.ENTER_KEY, 'select extrema target');
      // Wait for modal to close after selection
      await this.page.waitForSelector(TestConstants.GO_TO_EXTREMA_MODAL, { state: 'hidden', timeout: 5000 });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to select extrema target: ${errorMessage}`);
    }
  }

  /**
   * Gets all available extrema targets from the modal
   * @returns Promise resolving to an array of extrema target labels
   * @throws BarPlotError if unable to get targets
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
      throw new BarPlotError(`Failed to get extrema targets: ${errorMessage}`);
    }
  }

  /**
   * Gets the currently selected extrema target in the modal
   * @returns Promise resolving to the selected target label
   * @throws BarPlotError if unable to get selected target
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
      throw new BarPlotError(`Failed to get selected extrema target: ${errorMessage}`);
    }
  }

  /**
   * Navigates to the maximum value using Go To Extrema
   * Opens the modal, selects Maximum, and confirms
   * @returns Promise resolving when navigation to maximum is complete
   * @throws BarPlotError if navigation fails
   */
  public async goToMaximum(): Promise<void> {
    try {
      await this.openGoToExtremaModal();
      // Maximum is typically the first option, so just select it
      await this.selectExtremaTarget();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to navigate to maximum: ${errorMessage}`);
    }
  }

  /**
   * Navigates to the minimum value using Go To Extrema
   * Opens the modal, navigates to Minimum, and confirms
   * @returns Promise resolving when navigation to minimum is complete
   * @throws BarPlotError if navigation fails
   */
  public async goToMinimum(): Promise<void> {
    try {
      await this.openGoToExtremaModal();
      // Move down to select Minimum (assuming Maximum is first)
      await this.goToExtremaMoveDown();
      await this.selectExtremaTarget();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to navigate to minimum: ${errorMessage}`);
    }
  }

  // =====================
  // Hover Mode Methods
  // =====================

  /**
   * Hovers over a data point in the bar plot at a relative position
   * @param relativeX - X position relative to SVG (0-1)
   * @param relativeY - Y position relative to SVG (0-1)
   * @returns Promise resolving when hover is complete
   * @throws BarPlotError if hover fails
   */
  public async hoverOnDataPoint(relativeX: number, relativeY: number): Promise<void> {
    try {
      await this.hoverOnSvgPoint(this.selectors.svg, relativeX, relativeY);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to hover on data point: ${errorMessage}`);
    }
  }

  /**
   * Clicks on a data point in the bar plot at a relative position
   * @param relativeX - X position relative to SVG (0-1)
   * @param relativeY - Y position relative to SVG (0-1)
   * @returns Promise resolving when click is complete
   * @throws BarPlotError if click fails
   */
  public async clickOnDataPoint(relativeX: number, relativeY: number): Promise<void> {
    try {
      await this.clickOnSvgPoint(this.selectors.svg, relativeX, relativeY);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BarPlotError(`Failed to click on data point: ${errorMessage}`);
    }
  }
}
