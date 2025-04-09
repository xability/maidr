import type { FC } from 'react';
import { useViewModelState } from '@state/hook/useViewModel';
import React from 'react';

const Text: FC = () => {
  const { announce, value } = useViewModelState('text');

  return (
    <div
      id="maidr-text-container"
      {...(announce && {
        'aria-live': 'polite',
        'aria-atomic': 'true',
      })}
    >
      <p>
        {value}
      </p>
    </div>
  );
};

export default Text;
