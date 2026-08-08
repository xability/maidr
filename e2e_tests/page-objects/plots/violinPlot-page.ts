import type { Page } from '@playwright/test';
import { TestConstants } from '../../utils/constants';
import { ViolinPlotError } from '../../utils/errors';
import { BasePage } from '../base-page';

/**
 * Page object representing the Violin Plot page
 * Handles all Violin Plot specific interactions and verifications
 */
export class ViolinPlotPage extends BasePage {
  /**
   * Selectors for various UI elements
   */
  protected override readonly selectors = {
    notification: `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER} ${TestConstants.PARAGRAPH}`,
    info: `#${TestConstants.MAIDR_INFO_CONTAINER} ${TestConstants.PARAGRAPH}`,
    speedIndicator: `#${TestConstants.MAIDR_SPEED_INDICATOR}${TestConstants.VIOLIN_PLOT_ID}`,
    svg: `svg`,
    helpModal: TestConstants.MAIDR_HELP_MODAL,
    helpModalTitle: TestConstants.MAIDR_HELP_MODAL_TITLE,
    helpModalClose: TestConstants.HELP_MENU_CLOSE_BUTTON,
    settingsModal: TestConstants.MAIDR_SETTINGS_MODAL,
    chatModal: TestConstants.MAIDR_CHAT_MODAL,
  };

  /**
   * Creates a new ViolinPlotPage instance
   * @param page - The Playwright page object
   */
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigates to the Violin Plot page
   * @returns Promise resolving when navigation completes
   * @throws ViolinPlotError if navigation fails
   */
  public async navigateToViolinPlot(): Promise<void> {
    try {
      await super.navigateTo('examples/violin.html');
      await super.verifyPlotLoaded(this.selectors.svg);
    } catch (error) {
      throw new ViolinPlotError('Failed to navigate to Violin Plot', { cause: error });
    }
  }

  /**
   * Activates MAIDR by focusing the plot
   * @returns Promise resolving when MAIDR is activated
   * @throws ViolinPlotError if MAIDR cannot be activated
   */
  public override async activateMaidr(): Promise<void> {
    try {
      await super.activateMaidr(this.selectors.svg, TestConstants.VIOLIN_PLOT_ID);
    } catch (error) {
      throw new ViolinPlotError('Failed to activate MAIDR', { cause: error });
    }
  }

  /**
   * Activates MAIDR by clicking directly on the SVG element
   * @returns Promise resolving when MAIDR is activated via click
   * @throws ViolinPlotError if MAIDR cannot be activated by clicking
   */
  public override async activateMaidrOnClick(): Promise<void> {
    try {
      await super.activateMaidrOnClick(this.selectors.svg, TestConstants.VIOLIN_PLOT_ID);
    } catch (error) {
      throw new ViolinPlotError('Failed to activate MAIDR by clicking', { cause: error });
    }
  }

  /**
   * Gets the instruction text displayed by MAIDR
   * @returns Promise resolving to the instruction text
   * @throws ViolinPlotError if instruction text cannot be retrieved
   */
  public override async getInstructionText(): Promise<string> {
    try {
      return await super.getInstructionText(this.selectors.notification);
    } catch (error) {
      throw new ViolinPlotError('Failed to get instruction text', { cause: error });
    }
  }

  /**
   * Checks if text mode is active
   * @param textMode - The text mode to check
   * @returns Promise resolving to true if text mode is active, false otherwise
   * @throws ViolinPlotError if text mode status cannot be checked
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
      throw new ViolinPlotError('Failed to check text mode status', { cause: error });
    }
  }

  /**
   * Checks if braille mode is active
   * @param brailleMode - The braille mode to check
   * @returns Promise resolving to true if braille mode is active, false otherwise
   * @throws ViolinPlotError if braille mode status cannot be checked
   */
  public async isBrailleModeActive(brailleMode: string): Promise<boolean> {
    try {
      const modeMessages: Record<string, string> = {
        [TestConstants.BRAILLE_ON]: TestConstants.BRAILLE_MODE_ON,
        [TestConstants.BRAILLE_OFF]: TestConstants.BRAILLE_MODE_OFF,
      };
      return await super.isModeActive(this.selectors.notification, brailleMode, modeMessages);
    } catch (error) {
      throw new ViolinPlotError('Failed to check braille mode status', { cause: error });
    }
  }

  /**
   * Checks if sonification mode is active
   * @param sonificationMode - The sonification mode to check
   * @returns Promise resolving to true if sonification mode is active, false otherwise
   * @throws ViolinPlotError if sonification mode status cannot be checked
   */
  public async isSonificationActive(sonificationMode: string): Promise<boolean> {
    try {
      const modeMessages: Record<string, string> = {
        [TestConstants.SOUND_ON]: TestConstants.SOUND_MODE_ON,
        [TestConstants.SOUND_OFF]: TestConstants.SOUND_MODE_OFF,
      };
      return await super.isModeActive(this.selectors.notification, sonificationMode, modeMessages);
    } catch (error) {
      throw new ViolinPlotError('Failed to check sonification mode status', { cause: error });
    }
  }

  /**
   * Gets the current data point information
   * @returns Promise resolving to the current data point information
   * @throws ViolinPlotError if data point information cannot be retrieved
   */
  public override async getCurrentDataPointInfo(): Promise<string> {
    try {
      return await super.getCurrentDataPointInfo(this.selectors.info);
    } catch (error) {
      throw new ViolinPlotError('Failed to get current data point information', { cause: error });
    }
  }

  /**
   * Gets the current speed toggle information
   * @returns Promise resolving to the current speed toggle information
   * @throws ViolinPlotError if speed toggle information cannot be retrieved
   */
  public async getSpeedToggleInfo(): Promise<string> {
    try {
      return await this.getElementText(this.selectors.notification);
    } catch (error) {
      throw new ViolinPlotError('Failed to get speed toggle information', { cause: error });
    }
  }

  /**
   * Verifies the plot has loaded correctly
   * @returns Promise resolving when verification is complete
   * @throws ViolinPlotError if plot is not loaded correctly
   */
  public override async verifyPlotLoaded(): Promise<void> {
    try {
      await super.verifyPlotLoaded(this.selectors.svg);
    } catch (error) {
      throw new ViolinPlotError('Violin Plot failed to load correctly', { cause: error });
    }
  }

  /**
   * Moves to the next violin (right arrow)
   * @throws ViolinPlotError if movement fails
   */
  public async moveToNextViolin(): Promise<void> {
    try {
      await this.pressKeyAwaitingAnnouncement('ArrowRight', 'move to next violin');
    } catch (error) {
      throw new ViolinPlotError('Failed to move to next violin', { cause: error });
    }
  }

  /**
   * Moves to the previous violin (left arrow)
   * @throws ViolinPlotError if movement fails
   */
  public async moveToPreviousViolin(): Promise<void> {
    try {
      await this.pressKeyAwaitingAnnouncement('ArrowLeft', 'move to previous violin');
    } catch (error) {
      throw new ViolinPlotError('Failed to move to previous violin', { cause: error });
    }
  }

  /**
   * Moves up along the KDE curve (up arrow)
   * @throws ViolinPlotError if movement fails
   */
  public async moveUpKdeCurve(): Promise<void> {
    try {
      await this.pressKeyAwaitingAnnouncement('ArrowUp', 'move up KDE curve');
    } catch (error) {
      throw new ViolinPlotError('Failed to move up KDE curve', { cause: error });
    }
  }

  /**
   * Moves down along the KDE curve (down arrow)
   * @throws ViolinPlotError if movement fails
   */
  public async moveDownKdeCurve(): Promise<void> {
    try {
      await this.pressKeyAwaitingAnnouncement('ArrowDown', 'move down KDE curve');
    } catch (error) {
      throw new ViolinPlotError('Failed to move down KDE curve', { cause: error });
    }
  }

  /**
   * Switches to the next layer (Page Down)
   * @throws ViolinPlotError if layer switch fails
   */
  public async switchToNextLayer(): Promise<void> {
    try {
      await this.pressKeyAwaitingAnnouncement('PageDown', 'switch to next layer');
    } catch (error) {
      throw new ViolinPlotError('Failed to switch to next layer', { cause: error });
    }
  }

  /**
   * Switches to the previous layer (Page Up)
   * @throws ViolinPlotError if layer switch fails
   */
  public async switchToPreviousLayer(): Promise<void> {
    try {
      await this.pressKeyAwaitingAnnouncement('PageUp', 'switch to previous layer');
    } catch (error) {
      throw new ViolinPlotError('Failed to switch to previous layer', { cause: error });
    }
  }

  /**
   * Gets the X-axis title
   * @returns Promise resolving to the X-axis title
   * @throws ViolinPlotError if X-axis title cannot be retrieved
   */
  public async getXAxisTitle(): Promise<string> {
    try {
      return await super.getAxisTitle(this.selectors.info);
    } catch (error) {
      throw new ViolinPlotError('Failed to get X-axis title', { cause: error });
    }
  }

  /**
   * Gets the Y-axis title
   * @returns Promise resolving to the Y-axis title
   * @throws ViolinPlotError if Y-axis title cannot be retrieved
   */
  public async getYAxisTitle(): Promise<string> {
    try {
      return await super.getAxisTitle(this.selectors.info);
    } catch (error) {
      throw new ViolinPlotError('Failed to get Y-axis title', { cause: error });
    }
  }
}
