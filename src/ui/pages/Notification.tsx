import type { FC } from 'react';
import { useAppSelector } from '@redux/hook/useStore';
import React from 'react';

const Notification: FC = () => {
    const { value: message } = useAppSelector(state => state.notification);

    return (
        <div id="maidr-notification-container" aria-atomic="true" aria-live="assertive">
            <p>
                {message}
            </p>
        </div>
    );
};

export default Notification;
