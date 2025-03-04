import type { Keymap } from '@service/keybinding';

export enum Scope {
  CHAT = 'CHAT',
  DEFAULT = 'DEFAULT',
  HELP = 'HELP',
  LABEL = 'LABEL',
  REVIEW = 'REVIEW',
  SETTINGS = 'SETTINGS',
}

export type Keys = keyof Keymap[Scope];
