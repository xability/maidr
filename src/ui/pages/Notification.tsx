import type { FC } from 'react';
import React from 'react';

interface NotificationProps {
  message: string;
}

const Notification: FC<NotificationProps> = ({ message }) => {
  return (
    <div id="maidr-notification-container" aria-atomic="true" aria-live="assertive">
      <p>
        {message}
      </p>
    </div>
  );
};

export default Notification;
