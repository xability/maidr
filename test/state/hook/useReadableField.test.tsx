/**
 * @jest-environment jsdom
 */

/**
 * `useReadableField` never lets the fields' floor take the chart down.
 *
 * An error thrown out of a layout effect unmounts the whole React tree, and
 * the floor reads and writes a page MAIDR does not control: a page that held
 * a field's transition at a playbackRate of 0 made it throw, and the chart
 * vanished on the reader's next step. Whatever the floor throws, the hook
 * logs it and leaves the field as it is. The floor itself is stood in for
 * here; `test/util/readableField.test.ts` covers it.
 */

import type { ReadableField } from '@util/readableField';
import { afterAll, afterEach, describe, expect, it, jest } from '@jest/globals';
import { useReadableField } from '@state/hook/useReadableField';
import { render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@type/settings';
import { keepFieldReadable } from '@util/readableField';
import React, { useRef } from 'react';
import '@testing-library/jest-dom/jest-globals';

jest.mock('@state/hook/useViewModel', () => ({
  useViewModelState: (): unknown => DEFAULT_SETTINGS,
}));

jest.mock('@util/readableField', () => ({
  keepFieldReadable: jest.fn(),
}));

const keep = jest.mocked(keepFieldReadable);

/** A field the hook keeps readable, re-rendered with a new `step` on every step. */
const Field: React.FC<{ step: object }> = ({ step }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useReadableField(ref, step);
  return <textarea ref={ref} aria-label="braille" readOnly />;
};

/**
 * A floor whose calls do what a case asks.
 * @param check - What its check does
 * @param dispose - What its dispose does
 * @returns The floor
 */
function floorThat(check: () => void, dispose: () => void = () => {}): ReadableField {
  return { check: jest.fn(check), dispose: jest.fn(dispose) };
}

/** What a failing floor throws, as a browser does for a frozen transition. */
function frozen(): never {
  throw new DOMException('Cannot finish Animation with a playbackRate of 0.', 'InvalidStateError');
}

// The hook logs what the floor throws, on purpose: silenced for the file.
const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

afterAll(() => {
  logged.mockRestore();
});

describe('useReadableField', () => {
  afterEach(() => {
    logged.mockClear();
    keep.mockReset();
  });

  it('should keep the field drawn when the floor throws on a step', () => {
    const floor = floorThat(frozen);
    keep.mockReturnValue(floor);
    const { rerender } = render(<Field step={{}} />);

    rerender(<Field step={{}} />);

    expect(floor.check).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('textbox', { name: 'braille' })).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('[useReadableField]'), expect.any(DOMException));
  });

  it('should keep the field drawn when the floor cannot be made', () => {
    keep.mockImplementation(frozen);

    render(<Field step={{}} />);

    expect(screen.getByRole('textbox', { name: 'braille' })).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('[useReadableField]'), expect.any(DOMException));
  });

  it('should unmount cleanly when the floor throws as it is disposed', () => {
    const floor = floorThat(() => {}, frozen);
    keep.mockReturnValue(floor);
    const { unmount } = render(<Field step={{}} />);

    unmount();

    expect(floor.dispose).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('[useReadableField]'), expect.any(DOMException));
  });

  it('should log nothing when the floor does not throw', () => {
    keep.mockReturnValue(floorThat(() => {}));
    const { rerender, unmount } = render(<Field step={{}} />);

    rerender(<Field step={{}} />);
    unmount();

    expect(logged).not.toHaveBeenCalled();
  });
});
