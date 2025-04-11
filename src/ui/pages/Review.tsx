import type { FC } from 'react';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React, { useEffect, useRef } from 'react';

const Review: FC = () => {
  const { value } = useViewModelState('review');
  const viewModel = useViewModel('review');
  const reviewRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const inputElement = reviewRef.current;
    inputElement?.focus();
  }, [reviewRef, viewModel]);

  return (
    <div id={Constant.REVIEW_CONTAINER}>
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
