import type { Keymap } from '@service/keybinding';

export enum Scope {
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
