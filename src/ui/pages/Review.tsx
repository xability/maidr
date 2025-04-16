import { useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React from 'react';

const Review: React.FC = () => {
  const { value } = useViewModelState('review');

  return (
    <div>
      <input
        id={Constant.REVIEW_INPUT}
        defaultValue={value}
        size={50}
        type="text"
        autoComplete="off"
        autoFocus
      />
    </div>
  );
};

export default Review;
