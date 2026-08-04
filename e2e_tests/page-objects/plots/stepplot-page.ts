import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { TestConstants } from '../../utils/constants';
import { StepPlotError } from '../../utils/errors';
import { BasePage } from '../base-page';

/**
 * Page object for the step plot page
 * Provides methods for interacting with the step (stairs) plot
 */
export class StepPlotPage extends BasePage {
  /**
   * Selectors for various UI elements
   */
  protected override readonly selectors = {
    notification: `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER} ${TestConstants.PARAGRAPH}`,
    info: `#${TestConstants.MAIDR_INFO_CONTAINER} ${TestConstants.PARAGRAPH}`,
    speedIndicator: `#${TestConstants.MAIDR_SPEED_INDICATOR}${TestConstants.STEPPLOT_ID}`,
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
   * The ID of the step plot
   */
  private readonly plotId = TestConstants.STEPPLOT_ID;

  /**
   * Creates a new StepPlotPage instance
   * @param page - The Playwright page object
   */
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigates to the step plot page
   * @throws StepPlotError if navigation fails
   */
  public async navigateToStepPlot(): Promise<void> {
    try {
      await super.navigateTo('examples/stepplot.html');
      await super.verifyPlotLoaded(this.selectors.svg);
    } catch (error) {
      throw new StepPlotError('Failed to navigate to step plot', { cause: error });
    }
  }

  /**
   * Activates MAIDR on the step plot
   * @throws StepPlotError if MAIDR cannot be activated
   */
  public override async activateMaidr(): Promise<void> {
    try {
      await super.activateMaidr(this.selectors.svg, this.plotId);
    } catch (error) {
      throw new StepPlotError('Failed to activate MAIDR', { cause: error });
    }
  }

  /**
   * Activates MAIDR by clicking on the step plot
   * @throws StepPlotError if MAIDR cannot be activated by clicking
   */
  public override async activateMaidrOnClick(): Promise<void> {
    try {
      await super.activateMaidrOnClick(this.selectors.svg, this.plotId);
    } catch (error) {
      throw new StepPlotError('Failed to activate MAIDR by clicking', { cause: error });
    }
  }

  /**
   * Gets the instruction text displayed by MAIDR
   * @returns Promise resolving to the instruction text
   * @throws StepPlotError if instruction text cannot be retrieved
   */
  public override async getInstructionText(): Promise<string> {
    try {
      return await super.getInstructionText(this.selectors.notification);
    } catch (error) {
      throw new StepPlotError('Failed to get instruction text', { cause: error });
    }
  }

  /**
   * Checks if text mode is active
   * @param textMode - The text mode to check
   * @returns Promise resolving to true if text mode is active, false otherwise
   * @throws StepPlotError if text mode status cannot be checked
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
      throw new StepPlotError('Failed to check text mode status', { cause: error });
    }
  }

  /**
   * Checks if braille mode is active
   * @param brailleMode - The braille mode to check
   * @returns Promise resolving to true if braille mode is active, false otherwise
   * @throws StepPlotError if braille mode status cannot be checked
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
      throw new StepPlotError('Failed to check braille mode status', { cause: error });
    }
  }

  /**
   * Reads the braille cells currently on the braille display.
   *
   * Braille is the modality that fails silently for a new trace type — an
   * unregistered encoder leaves the display blank while text and audio still
   * work — so this returns the raw cell string for the spec to assert on.
   * @returns Promise resolving to the braille content, whitespace trimmed
   * @throws StepPlotError if the braille display never appears
   */
  public async getBrailleContent(): Promise<string> {
    try {
      const textarea = await this.waitForElement(this.selectors.braille);
      return (await textarea.inputValue()).trim();
    } catch (error) {
      throw new StepPlotError('Failed to read the braille display', { cause: error });
    }
  }

  /**
   * Checks if sonification mode is active
   * @param sonificationMode - The sonification mode to check
   * @returns Promise resolving to true if sonification mode is active, false otherwise
   * @throws StepPlotError if sonification mode status cannot be checked
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
      throw new StepPlotError('Failed to check sonification mode status', { cause: error });
    }
  }

  /**
   * Gets the X-axis title
   * @returns Promise resolving to the X-axis title
   * @throws StepPlotError if X-axis title cannot be retrieved
   */
  public async getXAxisTitle(): Promise<string> {
    try {
      return await super.getAxisTitle(this.selectors.info);
    } catch (error) {
      throw new StepPlotError('Failed to get X-axis title', { cause: error });
    }
  }

  /**
   * Gets the Y-axis title
   * @returns Promise resolving to the Y-axis title
   * @throws StepPlotError if Y-axis title cannot be retrieved
   */
  public async getYAxisTitle(): Promise<string> {
    try {
      return await super.getAxisTitle(this.selectors.info);
    } catch (error) {
      throw new StepPlotError('Failed to get Y-axis title', { cause: error });
    }
  }

  /**
   * Gets the current playback speed
   * @returns Promise resolving to the current speed value
   * @throws StepPlotError if speed cannot be retrieved
   */
  public override async getPlaybackSpeed(): Promise<number> {
    try {
      return await super.getPlaybackSpeed(this.selectors.speedIndicator);
    } catch (error) {
      throw new StepPlotError('Failed to get playback speed', { cause: error });
    }
  }

  /**
   * Gets the current data point information
   * @returns Promise resolving to the current data point information
   * @throws StepPlotError if data point information cannot be retrieved
   */
  public override async getCurrentDataPointInfo(): Promise<string> {
    try {
      return await super.getCurrentDataPointInfo(this.selectors.info);
    } catch (error) {
      throw new StepPlotError('Failed to get current data point information', { cause: error });
    }
  }

  /**
   * Verifies the plot has loaded correctly
   * @returns Promise resolving when verification is complete
   * @throws StepPlotError if plot is not loaded correctly
   */
  public override async verifyPlotLoaded(): Promise<void> {
    try {
      await this.page.waitForLoadState('domcontentloaded');
      await expect(this.page.locator(this.selectors.svg)).toBeVisible({
        timeout: 10000,
      });
    } catch (error) {
      throw new StepPlotError('StepPlot plot failed to load correctly', { cause: error });
    }
  }
}
