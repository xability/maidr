import type { RootState } from '@redux/store';
import { store } from '@redux/store';
import HelpMenu from '@ui/pages/HelpMenu';
import { Constant } from '@util/constant';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, useSelector } from 'react-redux';

const App: React.FC = () => {
  const { enabled: isHelpEnabled } = useSelector((state: RootState) => state.helpMenu);

  return (
    <>
      {isHelpEnabled && <HelpMenu />}
    </>
  );
};

export function renderMaidrApp(maidrId: string, container?: HTMLElement): void {
  if (!container) {
    return;
  }

  const root = createRoot(container, {
    identifierPrefix: Constant.MAIDR_CONTAINER + maidrId,
  });
  root.render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
}
