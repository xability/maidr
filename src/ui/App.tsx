import type { Focus } from '@type/event';
import { useViewModelState } from '@state/hook/useViewModel';
import { store } from '@state/store';
import React from 'react';
import { Provider } from 'react-redux';
import Braille from './pages/Braille';
import Chat from './pages/Chat';
import GoTo from './pages/GoTo';
import Help from './pages/Help';
import Review from './pages/Review';
import Settings from './pages/Settings';
import Text from './pages/Text';
import Tooltip from './pages/Tooltip';

interface AppProps {
  plot: HTMLElement;
}

const App: React.FC<AppProps> = ({ plot }) => {
  const { enabled, message } = useViewModelState('text');
  const { focus, tooltip } = useViewModelState('display');
  const { visible } = useViewModelState('goTo');

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
      {tooltip.visible && <Tooltip plot={plot} />}
      {(enabled || message) && <Text />}
      {visible && <GoTo />}
      {renderFocusedComponent(focus)}
    </>
  );
};

export function MaidrApp(plot: HTMLElement): React.JSX.Element {
  return (
    <Provider store={store}>
      <App plot={plot} />
    </Provider>
  );
}
