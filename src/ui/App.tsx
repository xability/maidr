import { useAppSelector } from '@redux/hook/useStore';
import { store } from '@redux/store';
import Chat from '@ui/pages/Chat';
import Help from '@ui/pages/Help';
import Settings from '@ui/pages/Settings';
import React from 'react';
import { Provider } from 'react-redux';

const App: React.FC = () => {
  const { enabled: isHelpEnabled } = useAppSelector(state => state.help);
  const { enabled: isSettingsEnabled } = useAppSelector(state => state.settings);
  const { enabled: isChatEnabled } = useAppSelector(state => state.chat);

  return (
    <>
      {isHelpEnabled && <Help />}
      {isSettingsEnabled && <Settings />}
      {isChatEnabled && <Chat />}
    </>
  );
};

export const MaidrApp: React.JSX.Element = (
  <Provider store={store}>
    <App />
  </Provider>
);
