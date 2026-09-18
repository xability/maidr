import { Platform } from './platform';

/**
 * A keyboard shortcut in the form hotkeys-js binds: modifier tokens and one
 * key joined with `+`, such as `ctrl+shift+p` or `shift+/`. This module is
 * the one place a shortcut is parsed or spelled, so the help menu, the
 * recorder that lets a reader choose a new one, and the conflict check that
 * refuses a taken one all agree on what a shortcut is.
 */

/** The modifier tokens hotkeys-js understands, and the one spelling each is kept in. */
const MODIFIER_ALIASES: Readonly<Record<string, string>> = {
  'ctrl': 'ctrl',
  'control': 'ctrl',
  '⌃': 'ctrl',
  'command': 'command',
  'cmd': 'command',
  '⌘': 'command',
  'alt': 'alt',
  'option': 'alt',
  '⌥': 'alt',
  'shift': 'shift',
  '⇧': 'shift',
};

/** The order modifiers are written in, so two spellings of one chord compare equal. */
const MODIFIER_ORDER = ['ctrl', 'command', 'alt', 'shift'] as const;

/** Key tokens with more than one hotkeys-js spelling, reduced to one. */
const KEY_ALIASES: Readonly<Record<string, string>> = {
  escape: 'esc',
  return: 'enter',
  delete: 'del',
  insert: 'ins',
};

/**
 * `KeyboardEvent.code` values for keys whose `key` is not what hotkeys-js
 * wants: a shifted symbol arrives as the symbol (`?` for Shift+/), an arrow
 * as a word hotkeys-js does not use, and a keypad digit as a plain digit.
 * The physical key is what the reader pressed, and what the binding should
 * name -- `shift+/` fires again when they press Shift and the slash key,
 * whichever symbol their layout puts there.
 */
const CODE_TO_TOKEN: Readonly<Record<string, string>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Space: 'space',
  Enter: 'enter',
  NumpadEnter: 'enter',
  Escape: 'esc',
  Backspace: 'backspace',
  Delete: 'del',
  Insert: 'ins',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: '\'',
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  NumpadAdd: 'num_add',
  NumpadSubtract: 'num_subtract',
  NumpadMultiply: 'num_multiply',
  NumpadDivide: 'num_divide',
  NumpadDecimal: 'num_decimal',
};

/**
 * Keys a shortcut may not be recorded on.
 *
 * Tab moves focus and is how a keyboard user leaves the chart at all; a
 * shortcut on it would trap them. The function row, Insert and the lock keys
 * belong to the browser and the screen reader -- NVDA and JAWS build their
 * commands on Insert and Caps Lock -- so a binding there would fire on
 * someone else's command, or never reach MAIDR at all.
 */
const UNSUPPORTED_CODES = new Set([
  'Tab',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'ContextMenu',
  'PrintScreen',
  'Pause',
]);

/** How a key token reads in the help menu when the symbol alone is easy to miss. */
const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  '.': '. (period)',
  ',': ', (comma)',
  '/': '/ (slash)',
  '[': '[ (open bracket)',
  ']': '] (close bracket)',
  '\\': '\\ (backslash)',
  ';': '; (semicolon)',
  '\'': '\' (apostrophe)',
  '-': '- (minus)',
  '=': '= (equals)',
  '`': '` (backtick)',
  'num_add': 'numpad +',
  'num_subtract': 'numpad -',
  'num_multiply': 'numpad *',
  'num_divide': 'numpad /',
  'num_decimal': 'numpad .',
};

/**
 * The hotkeys-js token for the key a keydown event names, or null for a key
 * no shortcut may use.
 * @param event - The keydown event
 * @returns The token, or null
 */
function keyTokenOf(event: KeyboardEvent): string | null {
  const code = event.code;
  if (UNSUPPORTED_CODES.has(code) || /^F\d{1,2}$/.test(code)) {
    return null;
  }
  const mapped = CODE_TO_TOKEN[code];
  if (mapped !== undefined) {
    return mapped;
  }
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) {
    return letter[1].toLowerCase();
  }
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) {
    return digit[1];
  }
  const numpad = /^Numpad(\d)$/.exec(code);
  if (numpad) {
    return `num_${numpad[1]}`;
  }
  // A key the code table does not know, which is most keys on a non-Latin
  // layout. `key` is what the reader sees on the cap, and hotkeys-js binds a
  // single printable character by its upper-cased char code, so a one-character
  // `key` is bindable; anything longer is a named key this table has not met.
  const key = event.key;
  if (typeof key === 'string' && key.length === 1 && key !== ' ') {
    return key.toLowerCase();
  }
  return null;
}

/**
 * The shortcut a keydown event spells, in the form hotkeys-js binds.
 *
 * Modifier-only presses answer null: the reader is still holding the chord.
 * So does a key no shortcut may use; see {@link UNSUPPORTED_CODES}. Ctrl and
 * the Command key are told apart -- `ctrl` and `command` are different keys
 * to hotkeys-js on every platform -- so a Mac reader who records Command+B
 * gets Command+B, not the Control+B the same chord means on Windows.
 * @param event - The keydown event
 * @returns The combo, or null when the press is not a usable shortcut
 */
export function comboFromKeyboardEvent(event: KeyboardEvent): string | null {
  const key = keyTokenOf(event);
  if (key === null) {
    return null;
  }
  const parts: string[] = [];
  if (event.ctrlKey) {
    parts.push('ctrl');
  }
  if (event.metaKey) {
    parts.push('command');
  }
  if (event.altKey) {
    parts.push('alt');
  }
  if (event.shiftKey) {
    parts.push('shift');
  }
  parts.push(key);
  return parts.join('+');
}

/**
 * One shortcut in its canonical spelling: modifiers in a fixed order under
 * their one name each, the key last and lower-cased, so `Control+Shift+P`,
 * `shift+ctrl+p` and `ctrl+shift+p` are the same shortcut to the conflict
 * check. A spelling that names no key, or several, is returned as it came,
 * lower-cased, so it still compares equal to itself.
 * @param combo - A shortcut as hotkeys-js would bind it
 * @returns Its canonical spelling
 */
export function normalizeCombo(combo: string): string {
  const tokens = combo.toLowerCase().split('+').map(token => token.trim()).filter(token => token.length > 0);
  const modifiers = new Set<string>();
  const keys: string[] = [];
  for (const token of tokens) {
    const modifier = MODIFIER_ALIASES[token];
    if (modifier !== undefined) {
      modifiers.add(modifier);
    } else {
      keys.push(KEY_ALIASES[token] ?? token);
    }
  }
  const ordered = MODIFIER_ORDER.filter(modifier => modifiers.has(modifier));
  return [...ordered, ...keys].join('+');
}

/**
 * Every shortcut a hotkeys-js binding string names, canonically spelled.
 *
 * A binding may list alternatives separated by commas -- `=, shift+=,
 * num_add` -- and the comma key itself is written as `,`, which is why the
 * split has to know a `,` standing alone is a key and not a separator.
 * @param hotkey - A binding string as the keymaps write it
 * @returns The alternatives it names
 */
export function combosOf(hotkey: string): string[] {
  const alternatives: string[] = [];
  let current = '';
  for (let i = 0; i < hotkey.length; i++) {
    const char = hotkey[i];
    if (char === ',' && current.trim().length > 0 && !current.trim().endsWith('+')) {
      alternatives.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim().length > 0) {
    alternatives.push(current);
  }
  return alternatives.map(normalizeCombo).filter(combo => combo.length > 0);
}

/**
 * A shortcut as the help menu shows it: the tokens spaced around `+`, the
 * Alt key called Option on a Mac as the keymaps do, and a lone symbol named
 * so a screen reader that skips punctuation still says which key it is.
 * @param combo - A shortcut as hotkeys-js would bind it
 * @returns The shortcut spelled for a reader
 */
export function formatCombo(combo: string): string {
  const tokens = normalizeCombo(combo).split('+').filter(token => token.length > 0);
  return tokens
    .map((token) => {
      if (token === 'alt') {
        return Platform.alt;
      }
      return DISPLAY_NAMES[token] ?? token;
    })
    .join(' + ');
}
