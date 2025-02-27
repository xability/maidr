export abstract class TestConstants {
  // HTML elements.
  static readonly BODY = 'body';
  static readonly SVG = 'svg';
  static readonly HTML_ID = 'id';
  static readonly DIV = 'div';
  static readonly PARAGRAPH = 'p';

  // Cypress Selectors
  static readonly HAVE_ATTR = 'have.attr';
  static readonly HAVE_ID = 'have.id';
  static readonly SHOULD_EXIST = 'exist';
  static readonly INVOKE_TEXT = 'text';

  // Cypress Custom Selectors
  static readonly HORIZONTAL_FORWARD = 'left-to-right';
  static readonly HORIZONTAL_REVERSE = 'right-to-left';
  static readonly LEFT = 'left';
  static readonly RIGHT = 'right';

  // Plot Type IDs
  static readonly BAR_ID = 'bar';
  static readonly HISTOGRAM_ID = 'hist';
  static readonly LINE_ID = 'line';

  // Maidr IDs
  static readonly MAIDR_NOTIFICATION_CONTAINER = 'maidr-notification-container-';
  static readonly MAIDR_INFO_CONTAINER = 'maidr-info-container-';
  static readonly BRAILLE_TEXTAREA = 'maidr-braille-textarea-';

  // Maidr Keys
  static readonly TAB_KEY = 'Tab';
  static readonly LEFT_ARROW_KEY = 'ArrowLeft';
  static readonly RIGHT_ARROW_KEY = 'ArrowRight';
  static readonly UP_ARROW_KEY = 'ArrowUp';
  static readonly DOWN_ARROW_KEY = 'ArrowDown';
  static readonly BRAILLE_KEY = 'b';
  static readonly TEXT_KEY = 't';
  static readonly SOUND_KEY = 's';
  static readonly SPACE_KEY = ' ';
  static readonly PERIOD_KEY = '.';
  static readonly COMMA_KEY = ',';
  static readonly SLASH_KEY = '/';
  static readonly META_KEY = 'Meta';
  static readonly SHIFT_KEY = 'Shift';

  // Cypress Constants
  static readonly HASH = '#';

  // Instruction text
  static readonly BAR_INSTRUCTION_TEXT = 'This is a maidr plot of type: bar. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode. Use H for Help.';
  static readonly HISTOGRAM_INSTRUCTION_TEXT = 'This is a maidr plot of type: hist. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode. Use H for Help.';
  static readonly LINE_INSTRUCTION_TEXT = 'This is a maidr plot of type: line. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode. Use H for Help.';

  // Text Mode - Status messages
  static readonly TEXT_MODE_TERSE = 'Text mode is terse';
  static readonly TEXT_MODE_VERBOSE = 'Text mode is verbose';
  static readonly TEXT_MODE_OFF = 'Text mode is off';

  // Braille Mode - Status messages
  static readonly BRAILLE_INCEPTION = 'No info for braille';
  static readonly BRAILLE_MODE_ON = 'Braille is on';
  static readonly BRAILLE_MODE_OFF = 'Braille is off';

  // Sound Mode - Status messages
  static readonly SOUND_MODE_ON = 'Sound is on';
  static readonly SOUND_MODE_OFF = 'Sound is off';

  // Speed - Status messages
  static readonly SPEED_UP = 'Speed up';
  static readonly SPEED_DOWN = 'Speed down';
  static readonly SPEED_RESET = 'Reset speed';

  // Time constants
  static readonly ONE_SECOND = 1000;
  static readonly HALF_SECOND = 500;
  static readonly ONE_MILLISECOND = 100;
}
