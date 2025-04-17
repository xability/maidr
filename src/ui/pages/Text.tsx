import { useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React from 'react';

const Text: React.FC = () => {
  const { enabled, announce, value, message } = useViewModelState('text');
  const shouldAnnounce = announce || message;

  return (
    <div
      id={Constant.TEXT_CONTAINER}
      {...(shouldAnnounce && {
        role: 'alert',
      })}
    >
      <p>
        {message || (enabled && value)}
      </p>
    </div>
  );
};

export default Text;
