import type { MaidrContextValue } from '@state/context';
import type { AppStore } from '@state/store';
import type { Focus } from '@type/event';
import type { FC, JSX } from 'react';
import { createTheme, ThemeProvider } from '@mui/material';
import { MaidrContext } from '@state/context';
import { useViewModelState } from '@state/hook/useViewModel';
import { readHtmlFontSize, watchRootFontSize } from '@util/htmlFontSize';
import { useMemo, useSyncExternalStore } from 'react';
import { Provider } from 'react-redux';
import Braille from './component/Braille';
import CandlestickDeltaSettings from './component/CandlestickDeltaSettings';
import Chat from './component/Chat';
import CommandPalette from './component/CommandPalette';
import Description from './component/Description';
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

  // MUI sizes this UI's text in rem and assumes a 16px root. Telling it how
  // the page's root compares with the reader's default size keeps a host
  // that shrinks its root -- Bootstrap 3 sets 10px -- from shrinking every
  // dialog with it (see `readHtmlFontSize`). Read on every render, so a
  // dialog is sized for the page as it is when it opens rather than as it was
  // when the chart was activated, and again when a resize moves the root
  // under a dialog that is already open (see `watchRootFontSize`).
  const htmlFontSize = useSyncExternalStore(watchRootFontSize, readHtmlFontSize, readHtmlFontSize);
  const theme = useMemo(() => createTheme({ typography: { htmlFontSize } }), [htmlFontSize]);

  const renderFocusedComponent = (focused: Focus | null): JSX.Element | null => {
    switch (focused) {
      case 'BRAILLE':
        return <Braille />;

      case 'CANDLESTICK_DELTA_SETTINGS':
        return <CandlestickDeltaSettings />;

      case 'CHAT':
        return <Chat />;

      case 'COMMAND_PALETTE':
        return <CommandPalette />;

      case 'DESCRIPTION':
        return <Description />;

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
    <ThemeProvider theme={theme}>
      {tooltip.visible && <Tooltip plot={plot} />}
      <Text />
      {renderFocusedComponent(focus)}
    </ThemeProvider>
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
