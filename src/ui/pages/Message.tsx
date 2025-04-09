import { useViewModelState } from '@state/hook/useViewModel';
import Notification from '@ui/pages/Notification';
import Text from '@ui/pages/Text';
import React from 'react';

const Message: React.FC = () => {
  const { value: notification } = useViewModelState('notification');
  const { enabled: isTextEnabled } = useViewModelState('text');

  return (
    <>
      {
        notification
          ? <Notification message={notification} />
          : isTextEnabled
            ? <Text />
            : null
      }
    </>
  );
};

export default Message;
