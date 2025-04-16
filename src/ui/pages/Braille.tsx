import type { FormEvent } from 'react';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React, { useEffect, useRef } from 'react';

const Braille: React.FC = () => {
  const viewModel = useViewModel('braille');
  const { value, index } = useViewModelState('braille');

  const brailleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (brailleRef.current) {
      brailleRef.current.selectionStart = index;
      brailleRef.current.selectionEnd = index;
    }
  }, [index]);

  const handleSelectionChange = (event: FormEvent<HTMLTextAreaElement>): void => {
    const textArea = event.currentTarget;
    viewModel.moveToIndex(textArea.selectionStart);
  };

  return (
    <div>
      <textarea
        id={Constant.BRAILLE_TEXT_AREA}
        ref={brailleRef}
        defaultValue={value}
        onSelect={handleSelectionChange}
        autoCapitalize="off"
        autoFocus
      />
    </div>
  );
};

export default Braille;
