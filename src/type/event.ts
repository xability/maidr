import type { Keymap } from '@service/keybinding';

export enum EventType {
  CLICK = 'click',
  DOM_LOADED = 'DOMContentLoaded',
  FOCUS_IN = 'focusin',
  FOCUS_OUT = 'focusout',
  KEY_DOWN = 'keydown',
  SELECTION_CHANGE = 'selectionchange',
}

export type Status =
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED';

export enum Scope {
  BRAILLE = 'BRAILLE',
  CHAT = 'CHAT',
  HELP = 'HELP',
  FIGURE_LABEL = 'FIGURE_LABEL',
  SUBPLOT = 'SUBPLOT',
  TRACE = 'TRACE',
  TRACE_LABEL = 'TRACE_LABEL',
  REVIEW = 'REVIEW',
  SETTINGS = 'SETTINGS',
}

export type Keys = keyof Keymap[Scope];
