import { useViewModelState } from '@state/hook/useViewModel';
import { store } from '@state/store';
import React from 'react';
import { Provider } from 'react-redux';
import Chat from './pages/Chat';
import Help from './pages/Help';
import Settings from './pages/Settings';
import Text from './pages/Text';

const App: React.FC = () => {
  const { enabled: isTextEnabled, message } = useViewModelState('text');
  const { enabled: isHelpEnabled } = useViewModelState('help');
  const { enabled: isSettingsEnabled } = useViewModelState('settings');
  const { enabled: isChatEnabled } = useViewModelState('chat');

  return (
    <>
      {(isTextEnabled || message) && <Text />}
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
