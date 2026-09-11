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
 * The Español dictionary. Typed against the English key set, so a key added
 * to English without a Korean rendering fails the type check rather than
 * falling silently back to English at runtime.
 */
export const es: Record<MessageKey, string> = {
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
