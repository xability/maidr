import type { FormEvent } from 'react';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React, { useEffect, useId, useRef } from 'react';

const Braille: React.FC = () => {
  const id = useId();
  const viewModel = useViewModel('braille');
  const { value, index } = useViewModelState('braille');

  const brailleRef = useRef<HTMLTextAreaElement>(null);
  const lastIndexRef = useRef<number>(index);

  useEffect(() => {
    if (brailleRef.current) {
      brailleRef.current.value = value;
      brailleRef.current.selectionStart = index;
      brailleRef.current.selectionEnd = index;
      lastIndexRef.current = index;
    }
  }, [value, index]);

  const handleSelectionChange = (
    event: FormEvent<HTMLTextAreaElement>,
  ): void => {
    const textArea = event.currentTarget;
    const newIndex = textArea.selectionStart;

    if (newIndex !== lastIndexRef.current) {
      lastIndexRef.current = newIndex;
      viewModel.moveToIndex(newIndex);
    }
  };

  return (
    <div id={id}>
      <textarea
        id={`${Constant.BRAILLE_TEXT_AREA}-${id}`}
        ref={brailleRef}
        defaultValue={value}
        onSelect={handleSelectionChange}
        autoCapitalize="off"
        autoFocus
        rows={5}
        cols={50} // todo: this should match the braille default size from settings
      />
    </div>
  );
};

export default Braille;
