import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React, { useEffect, useRef } from 'react';

const Review: React.FC = () => {
  const { value } = useViewModelState('review');
  const viewModel = useViewModel('review');
  const reviewRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const inputElement = reviewRef.current;
    inputElement?.focus();
  }, [reviewRef, viewModel]);

  return (
    <div>
      <input
        id={Constant.REVIEW_INPUT}
        ref={reviewRef}
        type="text"
        autoComplete="off"
        size={50}
        defaultValue={value}
      />
    </div>
  );
};

export default Review;
