import type { Keymap } from '@service/keybinding';

export enum Scope {
  DEFAULT = 'DEFAULT',
  HELP = 'HELP',
  LABEL = 'LABEL',
  REVIEW = 'REVIEW',
}

export type Keys = keyof Keymap[Scope];
