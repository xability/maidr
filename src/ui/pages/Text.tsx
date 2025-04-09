import type { FC } from 'react';
import { useViewModelState } from '@state/hook/useViewModel';
import React from 'react';

const Text: FC = () => {
  const { enabled, announce, value, message } = useViewModelState('text');
  const shouldAnnounce = announce || message;

  return (
    <div
      id="maidr-text-container"
      {...(shouldAnnounce && {
        'aria-live': 'assertive',
        'aria-atomic': 'true',
      })}
    >
      <p>
        {message || (enabled && value)}
      </p>
    </div>
  );
};

export default Text;
