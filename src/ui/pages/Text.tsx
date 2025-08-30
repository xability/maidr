import { useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React from 'react';

const Text: React.FC = () => {
  const { enabled, announce, value, message } = useViewModelState('text');
  const visual = (enabled && value) || '';
  const shouldAlert = typeof message === 'string' && message.trim().length > 0;

  return (
    <div
      id={Constant.TEXT_CONTAINER}
      {...(shouldAlert && { role: 'alert' })}
    >
      {(shouldAlert || (visual && visual.trim().length > 0)) && (
        <p>
          {shouldAlert ? message : visual}
        </p>
      )}
    </div>
  );
};

export default Text;
