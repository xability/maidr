/**
 * Constants used throughout the E2E test suite
 *
 * Contains selectors, element IDs, keyboard keys, instruction text,
 * and other constants needed for testing MAIDR functionality
 */
export abstract class TestConstants {
  /**
   * HTML element selectors
   */
  static readonly BODY = 'body';
  static readonly SVG = 'svg';
  static readonly HTML_ID = 'id';
  static readonly DIV = 'div';
  static readonly PARAGRAPH = 'p';

  /**
   * Directional constants for navigation tests
   */
  static readonly HORIZONTAL_FORWARD = 'left-to-right';
  static readonly HORIZONTAL_REVERSE = 'right-to-left';
  static readonly LEFT = 'left';
  static readonly RIGHT = 'right';

  /**
   * Plot type identifiers
   */
  static readonly BAR_ID = 'bar';
  static readonly HEATMAP_ID = 'heatmap';
  static readonly HISTOGRAM_ID = 'hist';
  static readonly LINEPLOT_ID = 'line';
  static readonly DODGED_BARPLOT_ID = 'dodged_bar';
  static readonly STACKED_BARPLOT_ID = 'stacked_bar';
  static readonly BOXPLOT_VERTICAL_ID = 'boxplot_vertical';
  static readonly BOXPLOT_HORIZONTAL_ID = 'boxplot_horizontal';
  static readonly MULTI_LINEPLOT_ID = 'multi-line';
  static readonly MULTI_LAYER_PLOT_ID = 'multi-layer';

  /**
   * MAIDR plot identifiers
   */
  static readonly PLOT_EXTREME_VERIFICATION = 'No plot info to display';
  /**
   * MAIDR component identifiers
   */
  static readonly MAIDR_NOTIFICATION_CONTAINER = 'maidr-text-container';
  static readonly MAIDR_INFO_CONTAINER = 'maidr-text-container';
  static readonly MAIDR_SPEED_INDICATOR = 'maidr-speed-indicator-';
  static readonly BRAILLE_TEXTAREA = 'maidr-braille-textarea-';
  static readonly MAIDR_HELP_MODAL = '.MuiDialog-container';
  static readonly MAIDR_HELP_MODAL_TITLE = '.MuiDialogTitle-root h6';
  static readonly MAIDR_SETTINGS_MODAL = '.MuiDialog-container div[role="dialog"]';
  static readonly MAIDR_CHAT_MODAL = '.MuiDialog-container div[role="dialog"]';

  /**
   * Keyboard key constants
   */
  static readonly TAB_KEY = 'Tab';
  static readonly LEFT_ARROW_KEY = 'ArrowLeft';
  static readonly RIGHT_ARROW_KEY = 'ArrowRight';
  static readonly UP_ARROW_KEY = 'ArrowUp';
  static readonly DOWN_ARROW_KEY = 'ArrowDown';
  static readonly BRAILLE_KEY = 'b';
  static readonly TEXT_KEY = 't';
  static readonly SOUND_KEY = 's';
  static readonly AUTOPLAY_KEY = 'a';
  static readonly SPACE_KEY = ' ';
  static readonly PERIOD_KEY = '.';
  static readonly COMMA_KEY = ',';
  static readonly SLASH_KEY = '/';
  static readonly META_KEY = 'Meta';
  static readonly SHIFT_KEY = 'Shift';
  static readonly HOME_KEY = 'Home';
  static readonly END_KEY = 'End';
  static readonly PLUS_KEY = '+';
  static readonly MINUS_KEY = '-';
  static readonly ZERO_KEY = '0';
  static readonly REVIEW_KEY = 'r';
  static readonly LABEL_KEY = 'l';
  static readonly X_AXIS_TITLE = 'x';
  static readonly Y_AXIS_TITLE = 'y';
  static readonly COMMAND_KEY = 'Meta';
  static readonly ESCAPE_KEY = 'Escape';
  static readonly PAGE_UP_KEY = 'PageUp';
  static readonly PAGE_DOWN_KEY = 'PageDown';

  /**
   * Common selectors and prefixes
   */
  static readonly HASH = '#';

  /**
   * Instruction text for different plot types
   */
  static readonly BAR_INSTRUCTION_TEXT = 'This is a maidr plot of type: bar. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.';
  static readonly HISTOGRAM_INSTRUCTION_TEXT = 'This is a maidr plot of type: hist. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.';
  static readonly HEATMAP_INSTRUCTION_TEXT = 'This is a maidr plot of type: heat. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.';
  static readonly LINEPLOT_INSTRUCTION_TEXT = 'This is a maidr plot of type: single line. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.';
  static readonly DODGED_BARPLOT_INSTRUCTION_TEXT = 'This is a maidr plot of type: dodged_bar. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.';
  static readonly STACKED_BARPLOT_INSTRUCTION_TEXT = 'This is a maidr plot of type: stacked_bar. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.';
  static readonly BOXPLOT_VERTICAL_INSTRUCTION_TEXT = 'This is a maidr plot of type: box. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.';
  static readonly BOXPLOT_HORIZONTAL_INSTRUCTION_TEXT = 'This is a maidr plot of type: box. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.';
  static readonly MULTI_LINEPLOT_INSTRUCTION_TEXT = 'This is a maidr plot of type: line. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.';
  static readonly MULTI_LAYER_PLOT_INSTRUCTION_TEXT = 'This is a maidr plot containing 2 layers, and this is layer 1 of 2: bar plot. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.';

  /**
   * Text Modes
   */
  static readonly TEXT_MODE_TERSE = 'terse';
  static readonly TEXT_MODE_VERBOSE = 'verbose';
  static readonly TEXT_MODE_OFF = 'off';

  /**
   * Status messages for text mode
   */
  static readonly TEXT_MODE_TERSE_MESSAGE = 'Text mode is terse';
  static readonly TEXT_MODE_VERBOSE_MESSAGE = 'Text mode is verbose';
  static readonly TEXT_MODE_OFF_MESSAGE = 'Text mode is off';

  /**
   *  Braille Modes
   */

  static readonly BRAILLE_ON = 'on';
  static readonly BRAILLE_OFF = 'off';
  /**
   * Status messages for braille mode
   */
  static readonly BRAILLE_INCEPTION = 'No info for braille';
  static readonly BRAILLE_MODE_ON = 'Braille is on';
  static readonly BRAILLE_MODE_OFF = 'Braille is off';
  static readonly BRAILLE_BOXPLOT_STATUS = 'Braille is not supported for plot type: box';

  /**
   * Sound Modes
   */
  static readonly SOUND_ON = 'on';
  static readonly SOUND_OFF = 'off';

  /**
   * Status messages for sound mode
   */
  static readonly SOUND_MODE_ON = 'Sound is on';
  static readonly SOUND_MODE_OFF = 'Sound is off';

  /**
   * Review Modes
   */
  static readonly REVIEW_MODE_ON = 'on';
  static readonly REVIEW_MODE_OFF = 'off';
  /**
   * Status messages for review mode
   */
  static readonly REVIEW_MODE_ON_MESSAGE = 'Review is on';
  static readonly REVIEW_MODE_OFF_MESSAGE = 'Review is off';

  /**
   * Status messages for speed changes
   */
  static readonly SPEED_UP = 'Speed up';
  static readonly SPEED_DOWN = 'Speed down';
  static readonly SPEED_RESET = 'Reset speed';

  /**
   * Help Menu Identifies
   */

  static readonly HELP_MENU_TITLE = 'Keyboard Shortcuts';
  static readonly HELP_MENU_CLOSE_BUTTON = '.MuiDialogActions-root button';

  /**
   * Settings Menu Identifiers
   */

  static readonly SETTINGS_MENU_TITLE = 'General Settings';

  /**
   * Chat Menu Identifiers
   */
  static readonly CHAT_DIALOG_TITLE = 'Chart Assistant';

  /**
   * Multi-layer plot identifiers
   */
  static readonly MULTI_LAYER_PLOT_UP_SWITCH = 'Layer 2 of 2: single line plot';
  static readonly MULTI_LAYER_PLOT_DOWN_SWITCH = 'Layer 1 of 2: bar plot';
  static readonly MULTI_LAYER_NO_ADDITIONAL_LAYERS = 'No additional layer'

  /**
   * Time constants (in milliseconds)
   */
  static readonly ONE_SECOND = 1000;
  static readonly HALF_SECOND = 500;
  static readonly ONE_MILLISECOND = 100;
}
