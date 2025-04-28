import { useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React, { useId } from 'react';

const Review: React.FC = () => {
  const id = useId();
  const { value } = useViewModelState('review');

  return (
    <div id={id}>
      <input
        id={`${Constant.REVIEW_INPUT}-${id}`}
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
