import { useReadableField } from '@state/hook/useReadableField';
import { useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React, { useId, useRef } from 'react';

const Review: React.FC = () => {
  const id = useId();
  const review = useViewModelState('review');
  const { value } = review;
  const inputRef = useRef<HTMLInputElement>(null);
  useReadableField(inputRef, review);

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
        autoFocus
      />
    </div>
  );
};

export default Review;
