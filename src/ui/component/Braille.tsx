import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import { DomEventType } from '@type/event';
import { Constant } from '@util/constant';
import React, { useEffect, useId, useRef } from 'react';

const Braille: React.FC = () => {
  const id = useId();
  const viewModel = useViewModel('braille');
  const { value, index } = useViewModelState('braille');
  const settings = useViewModelState('settings');
  const brailleDisplaySize = Math.max(
    1,
    Math.floor(settings.general.brailleDisplaySize),
  );

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
    <div id={id}>
      <textarea
        id={`${Constant.BRAILLE_TEXT_AREA}-${id}`}
        ref={brailleRef}
        defaultValue={value}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        wrap="off"
        rows={5}
        cols={brailleDisplaySize}
      />
    </div>
  );
};

export default Braille;
