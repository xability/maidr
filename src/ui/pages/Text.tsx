import { useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React from 'react';

const Text: React.FC = () => {
  const { enabled, announce, value, message } = useViewModelState('text');

  const navText = (enabled && value) || '';
  const messageText = typeof message === 'string' ? message : '';

  // Current text to expose via live region: prefer message, else nav when announce is enabled
  const current = messageText.trim().length > 0
    ? messageText
    : (announce && navText ? navText : '');

  const visual = messageText.trim().length > 0 ? messageText : navText;

  return (
    <div
      id={Constant.TEXT_CONTAINER}
      {...(current && { role: 'alert' })}
    >
      {visual && visual.trim().length > 0 && (
        <p>
          {visual}
        </p>
      )}
    </div>
  );
};

export default Text;
