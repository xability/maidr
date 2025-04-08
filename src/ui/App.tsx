import { useAppSelector } from '@redux/hook/useStore';
import { store } from '@redux/store';
import React from 'react';
import { Provider } from 'react-redux';
import Chat from './pages/Chat';
import Help from './pages/Help';
import Notification from './pages/Notification';
import Settings from './pages/Settings';
import Text from './pages/Text';

const App: React.FC = () => {
  const { enabled: isTextEnabled } = useAppSelector(state => state.text);
  const { enabled: isHelpEnabled } = useAppSelector(state => state.help);
  const { enabled: isSettingsEnabled } = useAppSelector(state => state.settings);
  const { enabled: isChatEnabled } = useAppSelector(state => state.chat);

  return (
    <>
      {isTextEnabled && <Text />}
      {isHelpEnabled && <Help />}
      {isSettingsEnabled && <Settings />}
      {isChatEnabled && <Chat />}
      <Notification />
    </>
  );
};

export const MaidrApp: React.JSX.Element = (
  <Provider store={store}>
    <App />
  </Provider>
);
