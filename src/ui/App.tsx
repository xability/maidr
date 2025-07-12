import type { Focus } from '@type/event';
import { useViewModelState } from '@state/hook/useViewModel';
import { store } from '@state/store';
import React from 'react';
import { Provider } from 'react-redux';
import Braille from './component/Braille';
import Chat from './component/Chat';
import Help from './component/Help';
import Review from './component/Review';
import Settings from './component/Settings';
import Text from './component/Text';
import Tooltip from './component/Tooltip';

interface AppProps {
  plot: HTMLElement;
}

const App: React.FC<AppProps> = ({ plot }) => {
  const { enabled, message } = useViewModelState('text');
  const { focus, tooltip } = useViewModelState('display');

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
