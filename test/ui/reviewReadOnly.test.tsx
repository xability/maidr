/**
 * @jest-environment jsdom
 */

/**
 * The review field takes no text.
 *
 * Review mode puts the announcement in a text field so a reader can walk it a
 * character or a word at a time and copy it. Left writable, a key nothing in
 * review is bound to -- a letter, a digit, Delete, a paste -- went into the
 * field, which then read something the chart never said ("s1Day is Saturday"
 * for "Day is Saturday"), and kept reading it until review was closed and
 * opened again.
 *
 * `readOnly` would stop that, but in Chromium it also stops the arrow keys,
 * Home and End moving the caret, which is how review is read. So the field
 * stays an ordinary text field and refuses the edits themselves: it cancels
 * every `beforeinput`, and puts its text back after any `input` that could not
 * be cancelled (an IME's composition can't). What jsdom can answer is that
 * both are wired; that a real keystroke leaves the text alone is a browser's
 * to show.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@type/settings';
import Review from '@ui/component/Review';
import '@testing-library/jest-dom/jest-globals';

const TEXT = 'Day is Saturday, Count is 87.0';

jest.mock('@state/hook/useViewModel', () => ({
  // The field also reads the settings, for high contrast mode.
  useViewModelState: (key: string): unknown => (key === 'settings' ? DEFAULT_SETTINGS : { value: TEXT }),
}));

/**
 * Renders the field and hands back the input it drew.
 */
function renderReview(): HTMLInputElement {
  const { container } = render(<Review />);
  const input = container.querySelector('input');
  if (input === null) {
    throw new Error('no review input rendered');
  }
  return input;
}

describe('review field', () => {
  it('shows the review text', () => {
    expect(renderReview()).toHaveValue(TEXT);
  });

  it.each([
    ['a typed letter', 'insertText', 's'],
    ['Delete', 'deleteContentForward', null],
    ['Backspace', 'deleteContentBackward', null],
    ['a paste', 'insertFromPaste', null],
    ['a drop', 'insertFromDrop', null],
    ['a cut', 'deleteByCut', null],
  ])('refuses %s', (_name, inputType, data) => {
    const input = renderReview();
    const event = new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true });

    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('puts its text back after an edit it could not refuse', () => {
    // An IME's composition text arrives in a beforeinput that cannot be
    // cancelled, so the edit lands and has to be undone.
    const input = renderReview();
    input.setSelectionRange(4, 4);
    input.dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'insertCompositionText',
      data: '한',
      bubbles: true,
      cancelable: false,
    }));
    input.value = 'Day 한is Saturday, Count is 87.0';

    fireEvent.input(input);

    expect(input).toHaveValue(TEXT);
    // The caret stays where the reader had it, not at the end of the line.
    expect(input.selectionStart).toBe(4);
  });

  it('stays an ordinary text field, so the caret can be moved through it', () => {
    // `readOnly` costs the caret in Chromium: the arrow keys stop moving it.
    const input = renderReview();

    expect(input).not.toHaveAttribute('readonly');
    expect(input).not.toBeDisabled();
  });
});
