export enum EventType {
  CLICK = 'click',
  DOM_LOADED = 'DOMContentLoaded',
  FOCUS_IN = 'focusin',
  FOCUS_OUT = 'focusout',
  KEY_DOWN = 'keydown',
  SELECTION_CHANGE = 'selectionchange',
}

export type Focus =
  | 'BRAILLE'
  | 'CHAT'
  | 'HELP'
  | 'PLOT'
  | 'REVIEW'
  | 'SETTINGS';
