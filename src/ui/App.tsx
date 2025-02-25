import type { RootState } from '@redux/store';
import { store } from '@redux/store';
import HelpMenu from '@ui/pages/HelpMenu';
import React from 'react';
import { Provider, useSelector } from 'react-redux';

const App: React.FC = () => {
  const { enabled: isHelpEnabled } = useSelector((state: RootState) => state.helpMenu);

  return (
    <>
      {isHelpEnabled && <HelpMenu />}
    </>
  );
};

export const MaidrApp: React.JSX.Element = (
  <Provider store={store}>
    <App />
  </Provider>
);
