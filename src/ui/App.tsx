import type { MaidrContextValue } from '@state/context';
import type { AppStore } from '@state/store';
import type { Focus } from '@type/event';
import type { FC, JSX } from 'react';
import { MaidrContext } from '@state/context';
import { useViewModelState } from '@state/hook/useViewModel';
import { Provider } from 'react-redux';
import Braille from './component/Braille';
import Chat from './component/Chat';
import CommandPalette from './component/CommandPalette';
import Help from './component/Help';
import Review from './component/Review';
import Settings from './component/Settings';
import Text from './component/Text';
import Tooltip from './component/Tooltip';
import { GoToExtrema } from './components/GoToExtrema';

interface AppProps {
  plot: HTMLElement;
}

const App: FC<AppProps> = ({ plot }) => {
  const { focus, tooltip } = useViewModelState('display');

  const renderFocusedComponent = (focused: Focus | null): JSX.Element | null => {
    switch (focused) {
      case 'BRAILLE':
        return <Braille />;

      case 'CHAT':
        return <Chat />;

      case 'COMMAND_PALETTE':
        return <CommandPalette />;

      case 'GO_TO_EXTREMA':
        return <GoToExtrema />;

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
      <Text />
      {renderFocusedComponent(focus)}
    </>
  );
};

interface MaidrAppProps {
  plot: HTMLElement;
  store: AppStore;
  contextValue: MaidrContextValue;
}

export function MaidrApp({ plot, store, contextValue }: MaidrAppProps): JSX.Element {
  return (
    <Provider store={store}>
      <MaidrContext.Provider value={contextValue}>
        <App plot={plot} />
      </MaidrContext.Provider>
    </Provider>
  );
}
