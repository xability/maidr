import { common } from './common';
import { description } from './description';
import { diagram } from './diagram';
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
 * Every key the English dictionary defines; the other dictionaries follow it.
 *
 * Named here, where the union of the areas' keys is written, so that the API
 * reference links to it. Named only as `keyof typeof en`, the same union had
 * no name of its own, and TypeDoc wrote every key out wherever a key is
 * taken: four times on the page of a helper that takes two, which outgrew the
 * 2 MB that Googlebot reads (`scripts/pageSizes.js`).
 */
export type MessageKey
  = | keyof typeof common
    | keyof typeof text
    | keyof typeof keybinding
    | keyof typeof rotor
    | keyof typeof notification
    | keyof typeof description
    | keyof typeof diagram
    | keyof typeof tactile
    | keyof typeof settings
    | keyof typeof dialogs
    | keyof typeof model
    | keyof typeof llm;

/**
 * The English dictionary, which defines the set of message keys.
 *
 * Split by the area of the code that speaks each message so a translator can
 * work one area at a time. Keys are namespaced the same way (`text.`,
 * `settings.`, …) so two areas cannot define the same key.
 *
 * Typed as a record of the areas' keys rather than as its own literal type.
 * The literal is every message written out twice in the API reference, and
 * that page outgrew the 2 MB that Googlebot reads (`scripts/pageSizes.js`).
 * The areas' own pages still show each message.
 */
export const en: Readonly<Record<MessageKey, string>> = {
  ...common,
  ...text,
  ...keybinding,
  ...rotor,
  ...notification,
  ...description,
  ...diagram,
  ...tactile,
  ...settings,
  ...dialogs,
  ...model,
  ...llm,
};
