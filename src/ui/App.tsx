import { useAppSelector } from '@redux/hook/useStore';
import { store } from '@redux/store';
import Help from '@ui/pages/Help';
import Settings from '@ui/pages/Settings';
import React from 'react';
import { Provider } from 'react-redux';

const App: React.FC = () => {
  const { enabled: isHelpEnabled } = useAppSelector(state => state.helpMenu);
  const { enabled: isSettingsEnabled } = useAppSelector(state => state.settings);

  return (
    <>
      {isHelpEnabled && <Help />}
      {isSettingsEnabled && <Settings />}
    </>
  );
};

export const MaidrApp: React.JSX.Element = (
  <Provider store={store}>
    <App />
  </Provider>
);
