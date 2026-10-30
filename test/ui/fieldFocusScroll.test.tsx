/**
 * @jest-environment jsdom
 */

/**
 * The braille and review fields take focus without scrolling the page.
 *
 * Both sit below the chart. Focusing one scrolled it into view, and on a
 * chart taller than the window that pushed the top of the chart, with the
 * point being read and its highlight, off the screen: for as long as braille
 * was on, since the braille field is focused again on every step, and for as
 * long as review was open. jsdom lays nothing out and scrolls nothing, so
 * what is asserted here is that each field asks not to be scrolled to.
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@type/settings';
import Braille from '@ui/component/Braille';
import Review from '@ui/component/Review';
import '@testing-library/jest-dom/jest-globals';

jest.mock('@state/hook/useViewModel', () => ({
  useViewModel: (): unknown => ({ moveToIndex: () => {} }),
  // Both fields also read the settings, for high contrast mode.
  useViewModelState: (key: string): unknown => {
    if (key === 'settings') {
      return DEFAULT_SETTINGS;
    }
    return key === 'braille'
      ? { value: '⠉⠉⠒⣀', index: 1, displaySize: 32, displayLines: 1 }
      : { value: 'Day is Saturday, Count is 87.0' };
  },
}));

afterEach(() => {
  jest.restoreAllMocks();
});

describe('a field MAIDR focuses below the chart', () => {
  it('should take focus without scrolling for braille', () => {
    const focus = jest.spyOn(HTMLTextAreaElement.prototype, 'focus');

    const { container } = render(<Braille />);

    expect(focus).toHaveBeenCalled();
    expect(focus.mock.calls.every(([options]) => options?.preventScroll === true)).toBe(true);
    expect(container.querySelector('textarea')).toHaveFocus();
  });

  it('should take focus without scrolling for review', () => {
    const focus = jest.spyOn(HTMLInputElement.prototype, 'focus');

    const { container } = render(<Review />);

    expect(focus).toHaveBeenCalled();
    expect(focus.mock.calls.every(([options]) => options?.preventScroll === true)).toBe(true);
    expect(container.querySelector('input')).toHaveFocus();
  });
});
