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
 * The English dictionary, which defines the set of message keys.
 *
 * Split by the area of the code that speaks each message so a translator can
 * work one area at a time. Keys are namespaced the same way (`text.`,
 * `settings.`, …) so two areas cannot define the same key.
 */
export const en = {
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
} as const;
