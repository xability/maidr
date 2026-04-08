import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import { DomEventType } from '@type/event';
import { Constant } from '@util/constant';
import React, { useEffect, useId, useRef } from 'react';

const Braille: React.FC = () => {
  const id = useId();
  const viewModel = useViewModel('braille');
  const { value, index, displaySize, displayLines } = useViewModelState('braille');

  const brailleRef = useRef<HTMLTextAreaElement>(null);
  const lastIndexRef = useRef<number>(index);
  // Keep a ref to the latest value so the selectionchange handler (registered
  // once) always sees the current braille string length, not the stale closure.
  const valueRef = useRef<string>(value);
  valueRef.current = value;

  // Handle Selection Change — fired when the user moves the cursor inside the
  // braille textarea (e.g. physical routing keys on a braille display).
  const handleSelectionChange = (event: Event): void => {
    const textArea = event.target as HTMLTextAreaElement;
    const newIndex = textArea.selectionStart;
    // Reject positions that fall on padding/newline characters beyond the data.
    if (newIndex >= valueRef.current.length) {
      textArea.setSelectionRange(lastIndexRef.current, lastIndexRef.current);
      return;
    }

    if (newIndex !== lastIndexRef.current) {
      lastIndexRef.current = newIndex;
      viewModel.moveToIndex(newIndex);
    }
  };

  useEffect(() => {
    const textArea = brailleRef.current;
    if (!textArea) {
      return;
    }

    textArea.addEventListener(DomEventType.SELECTION_CHANGE, handleSelectionChange);
    return () => {
      textArea.removeEventListener(DomEventType.SELECTION_CHANGE, handleSelectionChange);
    };
  }, []);

  useEffect(() => {
    const textArea = brailleRef.current;
    if (!textArea) {
      return;
    }

    // Update the ref FIRST so that if selectionchange fires synchronously
    // during the DOM assignments below, the handler sees the correct index
    // and does not snap the cursor back to the previous position.
    lastIndexRef.current = index;
    textArea.value = value;
    // Focus before setting the selection; some browsers reset the cursor to
    // position 0 when focus() is called on a previously-unfocused textarea,
    // which would undo the selectionStart assignment if done first.
    textArea.focus();
    textArea.selectionStart = index;
    textArea.selectionEnd = index;
  }, [value, index]);

  return (
    <div id={id}>
      <textarea
        id={`${Constant.BRAILLE_TEXT_AREA}-${id}`}
        ref={brailleRef}
        defaultValue={value}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        wrap="off"
        // role="application" ensures screen readers (NVDA/JAWS) pass all
        // keys, including Escape, through to the web app instead of
        // intercepting them for browse/virtual-cursor mode. Placed on the
        // textarea (not the wrapper div) to avoid suppressing browse-mode
        // navigation for any future sibling content.
        role="application"
        rows={displayLines}
        cols={displaySize}
      />
    </div>
  );
};

export default Braille;
