export abstract class Constant {
  private constructor() { /* Prevent instantiation */ }

  // HTML elements.
  static readonly ARTICLE = 'article';
  static readonly DIV = 'div';
  static readonly FIGURE = 'figure';
  static readonly IMAGE = 'img';
  static readonly INPUT = 'input';
  static readonly P = 'p';
  static readonly TEXT_AREA = 'textarea';

  // HTML IDs.
  static readonly BRAILLE_CONTAINER = 'maidr-braille-container';
  static readonly BRAILLE_TEXT_AREA = 'maidr-braille-textarea';
  static readonly MAIDR_ARTICLE = 'maidr-article';
  static readonly MAIDR_FIGURE = 'maidr-figure';
  static readonly MAIDR_HIGHLIGHT = 'maidr-highlight';
  static readonly NOTIFICATION_CONTAINER = 'maidr-notification-container';
  static readonly REACT_CONTAINER = 'maidr-react-container';
  static readonly REVIEW_CONTAINER = 'maidr-review-container';
  static readonly REVIEW_INPUT = 'maidr-review-input';
  static readonly TEXT_CONTAINER = 'maidr-info-container';

  // HTML Classes.
  static readonly BRAILLE_CLASS = 'maidr-braille';

  // HTML attributes.
  static readonly ARIA_ATOMIC = 'aria-atomic';
  static readonly ARIA_LABEL = 'aria-label';
  static readonly ARIA_LIVE = 'aria-live';
  static readonly CIRCLE_X = 'cx';
  static readonly CIRCLE_Y = 'cy';
  static readonly D = 'd';
  static readonly FILL = 'fill';
  static readonly POINTS = 'points';
  static readonly RADIUS = 'r';
  static readonly ROLE = 'role';
  static readonly STROKE = 'stroke';
  static readonly STROKE_WIDTH = 'stroke-width';
  static readonly TITLE = 'title';
  static readonly VISIBILITY = 'visibility';

  // Attribute values.
  static readonly AFTER_END = 'afterend';
  static readonly APPLICATION = 'application';
  static readonly ARE = ' are ';
  static readonly ASSERTIVE = 'assertive';
  static readonly CIRCLE = 'circle';
  static readonly COMMA = ',';
  static readonly COMMA_SPACE = ', ';
  static readonly EMPTY = '';
  static readonly HIDDEN = 'hidden';
  static readonly IS = ' is ';
  static readonly MAIDR_DATA = 'maidr-data';
  static readonly MAIDR_HIGHLIGHT_COLOR = '#BADA55';
  static readonly MB_3 = 'mb-3';
  static readonly NEW_LINE = '\n';
  static readonly OFF = 'off';
  static readonly SPACE = ' ';
  static readonly TEXT = 'text';
  static readonly THROUGH = ' through ';
  static readonly TRANSPARENT = 'transparent';
  static readonly TRUE = 'true';
  static readonly VISIBLE = 'visible';
  static readonly X = 'x';
  static readonly Y = 'y';
}
