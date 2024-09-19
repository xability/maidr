export default abstract class Constant {
  // HTML elements.
  static readonly BR = 'br';
  static readonly DIV = 'div';
  static readonly P = 'p';

  // HTML IDs.
  static readonly MAIN_CONTAINER_ID = 'maidr-main-container';
  static readonly CHART_CONTAINER_ID = 'maidr-chart-container';
  static readonly INFO_CONTAINER_ID = 'maidr-info-container';
  static readonly NOTIFICATION_CONTAINER_ID = 'maidr-notification-container';

  // HTML attributes.
  static readonly ARIA_LIVE = 'aria-live';
  static readonly ARIA_ATOMIC = 'aria-atomic';
  static readonly CLASS = 'class';
  static readonly ROLE = 'role';

  // HTML positions.
  static readonly AFTER_BEGIN = 'afterbegin';
  static readonly AFTER_END = 'afterend';
  static readonly BEFORE_BEGIN = 'beforebegin';
  static readonly BEFORE_END = 'beforeend';

  // Attribute values.
  static readonly APPLICATION = 'application';
  static readonly ASSERTIVE = 'assertive';
  static readonly MB_3 = 'mb-3';
  static readonly TRUE = 'true';
  static readonly X = 'x';
  static readonly Y = 'y';
  static readonly EMPTY: string = '';
}
