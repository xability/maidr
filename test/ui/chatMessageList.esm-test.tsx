/**
 * @jest-environment jsdom
 */

/**
 * How the chat transcript is exposed to a screen reader.
 *
 * A message bubble declares itself a list item, and ARIA requires a list item
 * to be owned by a list. Left orphaned in a plain region, the role is dropped
 * to generic by Chromium and NVDA loses list navigation, so the reader is
 * never told how many messages there are or which one they are on.
 *
 * This is an `esm-test` because `MessageBubble` renders `TypingEffect`, which
 * imports `react-markdown` — ESM-only, and unloadable from the CommonJS
 * project.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import { describe, expect, it, jest } from '@jest/globals';
import { MaidrContext } from '@state/context';
import { createMaidrStore } from '@state/store';
import { chatActions } from '@state/viewModel/chatViewModel';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { render, screen } from '@testing-library/react';
import Chat from '@ui/component/Chat';
import { Provider } from 'react-redux';
import '@testing-library/jest-dom/jest-globals';

/** The `ChatViewModel` surface `Chat` actually calls. */
type ChatStub = Pick<ChatViewModel, 'canSend' | 'toggle' | 'sendMessage'>;

/** The `SettingsViewModel` surface `Chat` actually calls. */
type SettingsStub = Pick<SettingsViewModel, 'toggle'>;

/** How many bubbles the transcript below holds. */
const MESSAGE_COUNT = 2;

/**
 * Renders the chat dialog over a real store holding the messages above.
 *
 * The store is the production one because `Chat` and `TypingEffect` both read
 * their state through `useViewModelState`; only the view models' own methods
 * are stubbed.
 */
function renderChat(): void {
  const chat: ChatStub = {
    canSend: true,
    toggle: jest.fn(),
    sendMessage: jest.fn(async () => {}),
  };
  const settings: SettingsStub = { toggle: jest.fn() };

  const store = createMaidrStore();
  store.dispatch(chatActions.addUserMessage({
    text: 'What is the highest bar?',
    timestamp: '2025-01-01T00:00:00.000Z',
  }));
  store.dispatch(chatActions.addSystemMessage({
    text: 'The highest bar is Q3.',
    timestamp: '2025-01-01T00:00:01.000Z',
  }));

  const registry = new ViewModelRegistry();
  registry.register('chat', chat as ChatViewModel);
  registry.register('settings', settings as SettingsViewModel);

  render(
    <Provider store={store}>
      <MaidrContext.Provider
        value={{
          viewModelRegistry: registry,
          commandExecutor: {} as unknown as CommandExecutor,
        }}
      >
        <Chat />
      </MaidrContext.Provider>
    </Provider>,
  );
}

describe('chat transcript structure', () => {
  it('should own every message item with a list', () => {
    renderChat();

    const list = screen.getByRole('list');
    const items = screen.getAllByRole('listitem');

    expect(items).toHaveLength(MESSAGE_COUNT);
    items.forEach(item => expect(list).toContainElement(item));
  });
});
