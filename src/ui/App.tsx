import type { RootState } from '@redux/store';
import { store } from '@redux/store';
import Help from '@ui/pages/Help';
import Settings from '@ui/pages/Settings';
import React from 'react';
import { Provider, useSelector } from 'react-redux';

const App: React.FC = () => {
  const { enabled: isHelpEnabled } = useSelector((state: RootState) => state.helpMenu);
  const { enabled: isSettingsEnabled } = useSelector((state: RootState) => state.settings);

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
