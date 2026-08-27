/**
 * @jest-environment jsdom
 */

/**
 * The braille field takes no text (#1131).
 *
 * It is a `<textarea>` because that is the only control a braille display's
 * routing keys can reach: they work by placing the caret, and the app reads
 * where it landed to move the reader to that cell. Nothing about that needs
 * the field to be editable, and left editable it misbehaved in two ways that
 * a reader met before anyone else did.
 *
 * Typing inserts a character, inserting moves the caret, and a moved caret is
 * indistinguishable from cursor routing -- so a digit, on a keyboard row
 * nothing is bound to, walked the reader onto a different data point. Then,
 * when that walk was refused because the reader was already at the end of the
 * data, the effect that rewrites the field from the view model never ran,
 * and the typed character stayed: a braille line showing a cell that is not
 * in the chart.
 *
 * The two cases here are what jsdom can honestly answer: that the field is
 * marked read-only, and that being read-only did not cost it cursor routing.
 * That the guard actually stops a keystroke is asserted in
 * `e2e_tests/specs/brailleReadOnly.spec.ts` instead, because `readOnly` is
 * enforced by the browser's own input handling -- jsdom assigns straight past
 * it, so a test that "typed" here would pass with the guard removed.
 */

import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react';
import { DomEventType } from '@type/event';
import Braille from '@ui/component/Braille';
import '@testing-library/jest-dom/jest-globals';

const moveToIndex = jest.fn();

const state = {
  value: '⠉⠉⠒⣀',
  index: 0,
  displaySize: 32,
  displayLines: 1,
};

jest.mock('@state/hook/useViewModel', () => ({
  useViewModel: (): Partial<BrailleViewModel> => ({ moveToIndex }),
  useViewModelState: (): typeof state => state,
}));

/**
 * Renders the field and hands back the textarea it drew.
 */
function renderBraille(): HTMLTextAreaElement {
  const { container } = render(<Braille />);
  const textArea = container.querySelector('textarea');
  if (textArea === null) {
    throw new Error('no braille textarea rendered');
  }
  return textArea;
}

describe('braille field', () => {
  it('should refuse text', () => {
    const textArea = renderBraille();

    expect(textArea).toHaveAttribute('readonly');
  });

  it('should still report a caret placed on it', () => {
    // Cursor routing: the display's routing key puts the caret on a cell and
    // the reader expects to arrive at that point. Read-only must not cost this.
    const textArea = renderBraille();
    textArea.setSelectionRange(2, 2);

    fireEvent(textArea, new Event(DomEventType.SELECTION_CHANGE));

    expect(moveToIndex).toHaveBeenCalledWith(2);
  });
});
