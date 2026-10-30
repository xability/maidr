import { useReadableField } from '@state/hook/useReadableField';
import { useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React, { useEffect, useId, useRef } from 'react';

const Review: React.FC = () => {
  const id = useId();
  const review = useViewModelState('review');
  const { value } = review;
  const inputRef = useRef<HTMLInputElement>(null);
  useReadableField(inputRef, review);
  const valueRef = useRef(value);
  valueRef.current = value;

  // The field holds the announcement for the reader to walk and copy, and
  // nothing typed into it could mean anything. Left writable, a key review
  // binds to nothing -- a letter, a digit, Delete, a paste -- went into the
  // text, which then read something the chart never said until review was
  // closed and opened again.
  //
  // Not `readOnly`, as the braille field is: in Chromium a read-only field
  // stops the arrow keys, Home and End moving its caret, and moving the caret
  // is how review is read. Nor `aria-readonly`, which exposes the field to a
  // screen reader exactly as `readOnly` does, where it has to stay the text
  // field the reader moves through. It stays an ordinary text field and
  // refuses the edits instead: every `beforeinput` is cancelled, and an edit
  // that cannot be cancelled -- an IME's composition text -- is undone on
  // `input`, with the caret left where the reader had it.
  useEffect(() => {
    const input = inputRef.current;
    if (input === null) {
      return;
    }
    let caret = input.selectionStart ?? 0;
    const refuse = (event: Event): void => {
      caret = input.selectionStart ?? 0;
      event.preventDefault();
    };
    const restore = (): void => {
      if (input.value === valueRef.current) {
        return;
      }
      input.value = valueRef.current;
      input.setSelectionRange(caret, caret);
    };
    input.addEventListener('beforeinput', refuse);
    input.addEventListener('input', restore);
    return () => {
      input.removeEventListener('beforeinput', refuse);
      input.removeEventListener('input', restore);
    };
  }, []);

  // Focused without scrolling, as the braille field is: the field sits below
  // the chart, and `autoFocus` scrolled it into view, which pushed the top of
  // a chart taller than the window, with the point being read, off the
  // screen while review was on.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div id={id}>
      <input
        id={`${Constant.REVIEW_INPUT}-${id}`}
        ref={inputRef}
        defaultValue={value}
        onFocus={event => event.target.setSelectionRange(0, 0)}
        size={50}
        type="text"
        autoComplete="off"
      />
    </div>
  );
};

export default Review;
