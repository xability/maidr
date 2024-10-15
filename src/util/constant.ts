export default abstract class Constant {
  // HTML elements.
  static readonly BR = 'br';
  static readonly DIV = 'div';
  static readonly INPUT = 'input';
  static readonly P = 'p';

  // HTML IDs.
  static readonly BRAILLE_CONTAINER_ID = 'maidr-braille-container';
  static readonly BRAILLE_INPUT_ID = 'maidr-braille-input';
  static readonly BRAILLE_INPUT_LENGTH = 32;
  static readonly MAIN_CONTAINER_ID = 'maidr-main-container';
  static readonly NOTIFICATION_CONTAINER_ID = 'maidr-notification-container';
  static readonly PLOT_CONTAINER_ID = 'maidr-plot-container';
  static readonly TEXT_CONTAINER_ID = 'maidr-info-container';

  // HTML Classes.
  static readonly BRAILLE_INPUT_CLASS = 'maidr-braille-input';

  // HTML attributes.
  static readonly ARIA_LIVE = 'aria-live';
  static readonly ARIA_ATOMIC = 'aria-atomic';
  static readonly ROLE = 'role';

  // HTML positions.
  static readonly AFTER_BEGIN = 'afterbegin';
  static readonly AFTER_END = 'afterend';
  static readonly BEFORE_BEGIN = 'beforebegin';
  static readonly BEFORE_END = 'beforeend';

  // Attribute values.
  static readonly APPLICATION = 'application';
  static readonly ASSERTIVE = 'assertive';
  static readonly HIDDEN = 'hidden';
  static readonly IS = ' is ';
  static readonly MB_3 = 'mb-3';
  static readonly TRUE = 'true';
  static readonly X = 'x';
  static readonly Y = 'y';
  static readonly EMPTY = '';
  static readonly SPACE = ' ';
  static readonly COMMA = ', ';
  static readonly THROUGH = ' through ';

  // Hotkeys Scopes
  static readonly HOTKEYS_SCOPE_DEFAULT = 'all';
  static readonly HOTKEYS_SCOPE_LABEL = 'label';
}
