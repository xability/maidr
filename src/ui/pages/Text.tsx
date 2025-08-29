import { useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React from 'react';

const Text: React.FC = () => {
  const { enabled, announce, value, message } = useViewModelState('text');
  const current = (message || (enabled && value) || '') as string;
  const hasContent = current.trim().length > 0 && (announce || message);

  return (
    <div
      id={Constant.TEXT_CONTAINER}
    >
      {current && (
        <p>
          {current}
        </p>
      )}
    </div>
  );
};

export default Text;
