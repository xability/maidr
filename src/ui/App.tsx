import type { RootState } from '@redux/store';
import { store } from '@redux/store';
import HelpMenu from '@ui/pages/HelpMenu';
import SettingsMenu from '@ui/pages/SettingsMenu';
import React from 'react';
import { Provider, useSelector } from 'react-redux';

const App: React.FC = () => {
  const { enabled: isHelpEnabled } = useSelector((state: RootState) => state.helpMenu);
  const { enabled: isSettingsEnabled } = useSelector((state: RootState) => state.settings);

  return (
    <>
      {isHelpEnabled && <HelpMenu />}
      {isSettingsEnabled && <SettingsMenu />}
    </>
  );
};

export const MaidrApp: React.JSX.Element = (
  <Provider store={store}>
    <App />
  </Provider>
);
