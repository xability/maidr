import type { Focus } from '@type/event';
import { useViewModelState } from '@state/hook/useViewModel';
import { store } from '@state/store';
import React from 'react';
import { Provider } from 'react-redux';
import Braille from './pages/Braille';
import Chat from './pages/Chat';
import Help from './pages/Help';
import Review from './pages/Review';
import Settings from './pages/Settings';
import Text from './pages/Text';

const App: React.FC = () => {
  const { enabled, message } = useViewModelState('text');
  const { focus } = useViewModelState('display');

  const renderFocusedComponent = (focused: Focus | null): React.JSX.Element | null => {
    switch (focused) {
      case 'BRAILLE':
        return <Braille />;

      case 'CHAT':
        return <Chat />;

      case 'HELP':
        return <Help />;

      case 'REVIEW':
        return <Review />;

      case 'SETTINGS':
        return <Settings />;

      default:
        return null;
    }
  };

  return (
    <>
      {(enabled || message) && <Text />}
      {renderFocusedComponent(focus)}
    </>
  );
};

export const MaidrApp: React.JSX.Element = (
  <Provider store={store}>
    <App />
  </Provider>
);
