import { useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React from 'react';

const Text: React.FC = () => {
  const { enabled, announce, value, message } = useViewModelState('text');
  const { rotor_value } = useViewModelState('rotor');
  const settings = useViewModelState('settings');
  console.log(enabled, announce, value, message);
  const navText = (enabled && value) || '';
  const messageText = typeof message === 'string' ? message : '';


  // Current text to expose via live region: prefer message, else nav when announce is enabled
  const current = messageText.trim().length > 0
    ? messageText
    : (announce && navText ? navText : '');

  const visual = messageText.trim().length > 0 ? messageText : navText;

  console.log(navText, messageText, visual, current);
  console.log(rotor_value);

  return (
    <div>
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

      <div
        id={Constant.ROTOR_AREA}
        aria-live={settings.general.ariaMode}
      >
        {rotor_value}
      </div>

    </div>
  );
};

export default Text;
