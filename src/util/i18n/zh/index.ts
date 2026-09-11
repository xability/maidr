import type { MessageKey } from '../index';
import { common } from './common';
import { description } from './description';
import { dialogs } from './dialogs';
import { keybinding } from './keybinding';
import { llm } from './llm';
import { model } from './model';
import { notification } from './notification';
import { rotor } from './rotor';
import { settings } from './settings';
import { tactile } from './tactile';
import { text } from './text';

/**
 * The Simplified Chinese dictionary. Typed against the English key set, so a key added
 * to English without a Chinese rendering fails the type check rather than
 * falling silently back to English at runtime.
 */
export const zh: Record<MessageKey, string> = {
  ...common,
  ...text,
  ...keybinding,
  ...rotor,
  ...notification,
  ...description,
  ...tactile,
  ...settings,
  ...dialogs,
  ...model,
  ...llm,
};
