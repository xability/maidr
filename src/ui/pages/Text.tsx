import { useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React from 'react';

const Text: React.FC = () => {
  const { enabled, announce, value, message } = useViewModelState('text');
  const current = (message || (enabled && value) || '') as string;
  const hasContent = current.trim().length > 0 && (announce || message);
  
  React.useEffect(() => {
    if (current && current.trim().length > 0) {
      console.log(`[JAWS DEBUG] Text component displaying:`, current);
      console.log(`[JAWS DEBUG] Will announce:`, announce || !!message);
      console.log(`[JAWS DEBUG] Current state:`, { enabled, announce, message, value });
    }
  }, [current, announce, message, enabled, value]);

  return (
    <div
      id={Constant.TEXT_CONTAINER}
      {...(hasContent && { role: 'alert' })}
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
