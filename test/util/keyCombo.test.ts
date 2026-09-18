import { describe, expect, it } from '@jest/globals';
import { comboFromKeyboardEvent, combosOf, formatCombo, normalizeCombo } from '@util/keyCombo';

/**
 * The one spelling of a shortcut that the recorder, the help menu and the
 * conflict check share (#189). A keydown has to become the string hotkeys-js
 * binds, two spellings of one chord have to compare equal, and the help menu
 * has to say the key in words a screen reader will not skip.
 */

/**
 * A keydown as a browser would deliver it.
 * @param code - The physical key
 * @param init - Modifiers and the printed key
 * @returns The event
 */
function keydown(code: string, init: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return { code, key: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...init } as KeyboardEvent;
}

describe('comboFromKeyboardEvent', () => {
  it('names a letter by the physical key, lower-cased', () => {
    expect(comboFromKeyboardEvent(keydown('KeyB', { key: 'B', shiftKey: true }))).toBe('shift+b');
    expect(comboFromKeyboardEvent(keydown('KeyX', { key: 'x' }))).toBe('x');
  });

  it('puts the modifiers first, Ctrl and Command told apart', () => {
    expect(comboFromKeyboardEvent(keydown('KeyP', { key: 'P', ctrlKey: true, shiftKey: true }))).toBe('ctrl+shift+p');
    expect(comboFromKeyboardEvent(keydown('KeyP', { key: 'P', metaKey: true, shiftKey: true }))).toBe('command+shift+p');
    expect(comboFromKeyboardEvent(keydown('ArrowUp', { key: 'ArrowUp', altKey: true }))).toBe('alt+up');
  });

  it('names a shifted symbol by the key it sits on, so the binding fires again', () => {
    // Shift and the slash key print `?`; hotkeys-js binds `shift+/`.
    expect(comboFromKeyboardEvent(keydown('Slash', { key: '?', shiftKey: true }))).toBe('shift+/');
    expect(comboFromKeyboardEvent(keydown('Comma', { key: ',' }))).toBe(',');
    expect(comboFromKeyboardEvent(keydown('Equal', { key: '+', shiftKey: true }))).toBe('shift+=');
  });

  it('names arrows, space and the digits the way the keymaps do', () => {
    expect(comboFromKeyboardEvent(keydown('ArrowRight', { key: 'ArrowRight' }))).toBe('right');
    expect(comboFromKeyboardEvent(keydown('Space', { key: ' ' }))).toBe('space');
    expect(comboFromKeyboardEvent(keydown('Digit3', { key: '3' }))).toBe('3');
    expect(comboFromKeyboardEvent(keydown('Numpad3', { key: '3' }))).toBe('num_3');
    expect(comboFromKeyboardEvent(keydown('PageUp', { key: 'PageUp' }))).toBe('pageup');
  });

  it('answers null while only a modifier is down', () => {
    expect(comboFromKeyboardEvent(keydown('ShiftLeft', { key: 'Shift', shiftKey: true }))).toBeNull();
    expect(comboFromKeyboardEvent(keydown('ControlLeft', { key: 'Control', ctrlKey: true }))).toBeNull();
  });

  it('refuses the keys a shortcut may not take', () => {
    // Tab is how a keyboard user leaves the chart; F-keys and Insert belong
    // to the browser and the screen reader.
    expect(comboFromKeyboardEvent(keydown('Tab', { key: 'Tab' }))).toBeNull();
    expect(comboFromKeyboardEvent(keydown('F5', { key: 'F5' }))).toBeNull();
    expect(comboFromKeyboardEvent(keydown('CapsLock', { key: 'CapsLock' }))).toBeNull();
  });

  it('falls back to the printed character on a layout the code table does not know', () => {
    expect(comboFromKeyboardEvent(keydown('IntlRo', { key: 'ろ' }))).toBe('ろ');
    expect(comboFromKeyboardEvent(keydown('Lang1', { key: 'HangulMode' }))).toBeNull();
  });
});

describe('normalizeCombo', () => {
  it('orders the modifiers and reduces each to one name', () => {
    expect(normalizeCombo('shift+ctrl+p')).toBe('ctrl+shift+p');
    expect(normalizeCombo('Control+Shift+P')).toBe('ctrl+shift+p');
    expect(normalizeCombo('option+shift+up')).toBe('alt+shift+up');
    expect(normalizeCombo('cmd+,')).toBe('command+,');
  });

  it('reduces a key with two spellings to one', () => {
    expect(normalizeCombo('escape')).toBe('esc');
    expect(normalizeCombo('return')).toBe('enter');
  });
});

describe('combosOf', () => {
  it('splits a binding into its alternatives', () => {
    expect(combosOf('=, shift+=, num_add')).toEqual(['=', 'shift+=', 'num_add']);
    expect(combosOf('esc,backspace')).toEqual(['esc', 'backspace']);
  });

  it('keeps a lone comma as the comma key rather than a separator', () => {
    expect(combosOf(',')).toEqual([',']);
    expect(combosOf('ctrl+,')).toEqual(['ctrl+,']);
    expect(combosOf('ctrl, up, down')).toEqual(['ctrl', 'up', 'down']);
  });
});

describe('formatCombo', () => {
  it('spaces the tokens and names a lone symbol in words', () => {
    expect(formatCombo('ctrl+shift+p')).toBe('ctrl + shift + p');
    expect(formatCombo('.')).toBe('. (period)');
    expect(formatCombo('shift+/')).toBe('shift + / (slash)');
    expect(formatCombo('num_add')).toBe('numpad +');
  });
});
