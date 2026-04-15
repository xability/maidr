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
  // Handle Selection Change
  const handleSelectionChange = (event: Event): void => {
    const textArea = event.target as HTMLTextAreaElement;
    const newIndex = textArea.selectionStart;
    if (newIndex >= value.length) {
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

    textArea.value = value;
    textArea.selectionStart = index;
    textArea.selectionEnd = index;
    textArea.focus();
    lastIndexRef.current = index;
  }, [value, index]);

  return (
    // role="application" on the wrapper ensures screen readers (NVDA/JAWS)
    // pass all keys, including Escape, through to the web app. Placed on
    // the div (not the textarea) so the textarea retains its native
    // "textbox" role — putting it on the textarea itself caused NVDA to
    // announce "edit braille app" and broke arrow-key cursor movement.
    // Browse-mode suppression for sibling content is not a concern here
    // because the textarea is the sole interactive child.
    <div id={id} role="application" aria-label="Braille display">
      <textarea
        id={`${Constant.BRAILLE_TEXT_AREA}-${id}`}
        ref={brailleRef}
        defaultValue={value}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        wrap="off"
        // Keep a 5-row minimum visible height so the textarea is comfortable to
        // read on a regular screen even when displayLines=1 (the default for
        // users without a physical multi-line braille display).  Users with a
        // larger physical display still see all their lines.
        rows={Math.max(displayLines, 5)}
        cols={displaySize}
      />
    </div>
  );
};

export default Braille;
