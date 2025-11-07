export abstract class Constant {
  private constructor() { /* Prevent instantiation */ }

  // HTML elements.
  static readonly ARTICLE = 'article';
  static readonly DIV = 'div';
  static readonly FIGURE = 'figure';
  static readonly IMAGE = 'img';
  static readonly INPUT = 'input';
  static readonly TEXT_AREA = 'textarea';

  // HTML IDs.
  static readonly BRAILLE_TEXT_AREA = 'maidr-braille-textarea';
  static readonly MAIDR_ARTICLE = 'maidr-article';
  static readonly MAIDR_FIGURE = 'maidr-figure';
  static readonly MAIDR_HIGHLIGHT = 'maidr-highlight';
  static readonly REACT_CONTAINER = 'maidr-react-container';
  static readonly REVIEW_INPUT = 'maidr-review-input';
  static readonly TEXT_CONTAINER = 'maidr-text-container';
  static readonly MAIDR_INSTRUCTION = 'maidr-instruction';
  static readonly ROTOR_AREA = 'maidr-rotor-area';

  // CSS classes.
  static readonly SR_ONLY_CLASS = 'maidr-sr-only';

  // HTML attributes.
  static readonly ARIA_LABEL = 'aria-label';
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
  static readonly X1 = 'x1';
  static readonly X2 = 'x2';
  static readonly Y1 = 'y1';
  static readonly Y2 = 'y2';

  // MAIDR Terms
  static readonly MAIDR_SUBPLOT = 'subplot';
  static readonly MAIDR = 'maidr';
  // CSS selector for elements whose `maidr` attribute contains JSON (starts with '{')
  static readonly MAIDR_JSON_SELECTOR = '[maidr^="{"]';
  // Attribute values.
  static readonly AFTER_END = 'afterend';
  static readonly APPLICATION = 'application';
  static readonly ARE = ' are ';
  static readonly CIRCLE = 'circle';
  static readonly CLOSE_BRACKET = ']';
  static readonly COMMA = ',';
  static readonly COMMA_SPACE = ', ';
  static readonly EMPTY = '';
  static readonly HIDDEN = 'hidden';
  static readonly IS = ' is ';
  static readonly LINE = 'line';
  static readonly MAIDR_DATA = 'maidr-data';
  static readonly MAIDR_HIGHLIGHT_COLOR = '#BADA55';
  static readonly NEW_LINE = '\n';
  static readonly OPEN_BRACKET = '[';
  static readonly POLYLINE = 'polyline';
  static readonly SPACE = ' ';
  static readonly THROUGH = ' through ';
  static readonly TRANSPARENT = 'transparent';
  static readonly VISIBLE = 'visible';
  static readonly X = 'x';
  static readonly Y = 'y';

  // Highlight values
  static readonly HIGHLIGHT_BASE_COLOR = { r: 255, g: 255, b: 255 };
  static readonly HIGHLIGHT_CONTRAST_RATIO = 3.0;
  static readonly HIGHLIGHT_COLOR_RATIO = 0.6;
  static readonly HIGHLIGHT_MAX_COLOR = 255;

  // rotor mode values
  static readonly HIGHER_VALUE_MODE = 'HIGHER VALUE NAVIGATION';
  static readonly LOWER_VALUE_MODE = 'LOWER VALUE NAVIGATION';
  static readonly DATA_MODE = 'DATA POINT NAVIGATION';
  static readonly NO_OF_ROTOR_NAV_MODES = 3;
}
