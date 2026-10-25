import { attachJosa, isJosaPair } from './josa';

/** Values substituted into a message's `{placeholders}`. */
export type MessageParams = Record<string, string | number | undefined>;

const PLACEHOLDER = /\{(\w+)(?:\|([^}]+))?\}/g;

/**
 * Fills a message template's placeholders.
 *
 * `{name}` is replaced by the parameter of that name; an absent parameter
 * renders as nothing. `{name|은는}` additionally attaches the Korean particle
 * whose form suits the value — see `josa.ts`. Any other modifier is ignored,
 * so an English template that copies the placeholder still renders.
 *
 * Kept apart from `./index`, which carries the English dictionary, so a
 * bundle with templates of its own -- a diagram adapter's -- can fill them
 * the same way without it.
 * @param template - The message text with placeholders
 * @param params - The values to substitute
 * @returns The rendered message
 */
export function interpolate(template: string, params: MessageParams = {}): string {
  return template.replace(PLACEHOLDER, (_match, name: string, modifier?: string) => {
    const raw = params[name];
    const value = raw === undefined ? '' : String(raw);
    if (modifier && isJosaPair(modifier)) {
      return attachJosa(value, modifier);
    }
    return value;
  });
}
