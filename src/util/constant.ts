/**
 * Abstract utility class containing constant values used throughout the application.
 */
export abstract class Constant {
  private constructor() { /* Prevent instantiation */ }

  // HTML elements.
  /** HTML article element tag name */
  static readonly ARTICLE = 'article';
  /** HTML div element tag name */
  static readonly DIV = 'div';
  /** HTML figure element tag name */
  static readonly FIGURE = 'figure';
  /** HTML img element tag name */
  static readonly IMAGE = 'img';
  /** HTML input element tag name */
  static readonly INPUT = 'input';
  static readonly STYLE = 'style';
  /** HTML textarea element tag name */
  static readonly TEXT_AREA = 'textarea';

  // HTML IDs.
  /** ID for the braille textarea element */
  static readonly BRAILLE_TEXT_AREA = 'maidr-braille-textarea';
  /** ID for the main MAIDR article container */
  static readonly MAIDR_ARTICLE = 'maidr-article';
  /** ID for the MAIDR figure container */
  static readonly MAIDR_FIGURE = 'maidr-figure';
  /** ID for the MAIDR highlight element */
  static readonly MAIDR_HIGHLIGHT = 'maidr-highlight';
  /** ID for the React component container */
  static readonly REACT_CONTAINER = 'maidr-react-container';
  /** ID for the review input element */
  static readonly REVIEW_INPUT = 'maidr-review-input';
  /** ID for the text content container */
  static readonly TEXT_CONTAINER = 'maidr-text-container';
  /** ID for the instruction text element */
  static readonly MAIDR_INSTRUCTION = 'maidr-instruction';
  /** ID for the rotor navigation area */
  static readonly ROTOR_AREA = 'maidr-rotor-area';

  // CSS classes.
  /** CSS class for screen reader only content */
  static readonly SR_ONLY_CLASS = 'maidr-sr-only';

  // HTML attributes.
  /** ARIA label attribute name */
  static readonly ARIA_LABEL = 'aria-label';
  /** SVG circle x-coordinate attribute */
  static readonly CIRCLE_X = 'cx';
  /** SVG circle y-coordinate attribute */
  static readonly CIRCLE_Y = 'cy';
  /** SVG path data attribute */
  static readonly D = 'd';
  /** SVG fill attribute */
  static readonly FILL = 'fill';
  static readonly MARGIN = 'margin';
  /** SVG points attribute for polygons */
  static readonly POINTS = 'points';
  /** SVG circle radius attribute */
  static readonly RADIUS = 'r';
  /** ARIA role attribute */
  static readonly ROLE = 'role';
  /** SVG stroke color attribute */
  static readonly STROKE = 'stroke';
  /** SVG stroke width attribute */
  static readonly STROKE_WIDTH = 'stroke-width';
  /** HTML title attribute */
  static readonly TITLE = 'title';
  /** SVG visibility attribute */
  static readonly VISIBILITY = 'visibility';
  /** SVG line x1 coordinate attribute */
  static readonly X1 = 'x1';
  /** SVG line x2 coordinate attribute */
  static readonly X2 = 'x2';
  /** SVG line y1 coordinate attribute */
  static readonly Y1 = 'y1';
  /** SVG line y2 coordinate attribute */
  static readonly Y2 = 'y2';

  // MAIDR Terms
  /** MAIDR subplot identifier */
  static readonly MAIDR_SUBPLOT = 'subplot';
  /** MAIDR attribute name */
  static readonly MAIDR = 'maidr';
  /** CSS selector for elements whose `maidr` attribute contains JSON (starts with '{') */
  static readonly MAIDR_JSON_SELECTOR = '[maidr^="{"]';
  // Attribute values.
  /** DOM insertion position after the element */
  static readonly AFTER_END = 'afterend';
  /** ARIA application role value (deprecated — prefer GRAPHICS_DOCUMENT for interactive charts) */
  static readonly APPLICATION = 'application';
  /** ARIA graphics-document role value for interactive SVG charts */
  static readonly GRAPHICS_DOCUMENT = 'graphics-document';
  /** ARIA roledescription attribute name */
  static readonly ARIA_ROLEDESCRIPTION = 'aria-roledescription';
  /** Text string for 'are' with spaces */
  static readonly ARE = ' are ';
  /** SVG circle element tag name */
  static readonly CIRCLE = 'circle';
  /** Close bracket character */
  static readonly CLOSE_BRACKET = ']';
  /** Comma character */
  static readonly COMMA = ',';
  /** Comma followed by space */
  static readonly COMMA_SPACE = ', ';
  /** Empty string constant */
  static readonly EMPTY = '';
  /** CSS visibility hidden value */
  static readonly HIDDEN = 'hidden';
  /** Text string for 'is' with spaces */
  static readonly IS = ' is ';
  /** SVG line element tag name */
  static readonly LINE = 'line';
  /** MAIDR data attribute identifier */
  static readonly MAIDR_DATA = 'maidr-data';
  /** Default highlight color in hex format */
  static readonly MAIDR_HIGHLIGHT_COLOR = '#BADA55';
  /** Newline character */
  static readonly NEW_LINE = '\n';
  /** Open bracket character */
  static readonly OPEN_BRACKET = '[';
  /** SVG polyline element tag name */
  static readonly POLYLINE = 'polyline';
  /** Space character */
  static readonly SPACE = ' ';
  /** Text string for 'through' with spaces */
  static readonly THROUGH = ' through ';
  /** CSS transparent color value */
  static readonly TRANSPARENT = 'transparent';
  /** CSS visibility visible value */
  static readonly VISIBLE = 'visible';
  /** X-axis coordinate identifier */
  static readonly X = 'x';
  /** Y-axis coordinate identifier */
  static readonly Y = 'y';

  // Highlight values
  /** Base color for highlight contrast calculations (white) */
  static readonly HIGHLIGHT_BASE_COLOR = { r: 255, g: 255, b: 255 };
  /** Minimum contrast ratio for highlight visibility */
  static readonly HIGHLIGHT_CONTRAST_RATIO = 3.0;
  /** Color adjustment ratio for creating highlights */
  static readonly HIGHLIGHT_COLOR_RATIO = 0.6;
  /** Maximum RGB color value */
  static readonly HIGHLIGHT_MAX_COLOR = 255;

  // rotor mode values
  /** Rotor mode for navigating to higher values */
  static readonly HIGHER_VALUE_MODE = 'HIGHER VALUE NAVIGATION';
  /** Rotor mode for navigating to lower values */
  static readonly LOWER_VALUE_MODE = 'LOWER VALUE NAVIGATION';
  /** Rotor mode for navigating data points */
  static readonly DATA_MODE = 'DATA POINT NAVIGATION';
  /** Total number of rotor navigation modes */
  static readonly NO_OF_ROTOR_NAV_MODES = 3;
}
