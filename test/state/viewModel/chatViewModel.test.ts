import type { UnknownAction } from '@reduxjs/toolkit';
import type { AudioService } from '@service/audio';
import type { ChatService } from '@service/chat';
import type { ChatState } from '@state/viewModel/chatViewModel';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import chatReducer, { chatActions, ChatViewModel } from '@state/viewModel/chatViewModel';

/**
 * Message ids have to be unique within a conversation (#705).
 *
 * They were `Date.now()` alone, which is unique only if no two are minted in
 * the same millisecond — a bound nothing enforces. What made it matter is #704:
 * each message's DOM id scope is derived from its message id, so two messages
 * sharing one share a scope, their footnote ids collide again, and a reference
 * resolves to whichever note comes first in document order. Everything still
 * renders, which is why it would not have been noticed.
 *
 * The clock is frozen rather than left to run, because a real clock makes the
 * old behaviour pass whenever two dispatches happen to straddle a millisecond
 * boundary — the flakiness being removed, used as the test's own oracle.
 *
 * These go through the action creators rather than dispatching by action type
 * as the other view model tests do. The id is minted in `prepare`, so an action
 * built by hand carries no id at all and the test would pass on `undefined`
 * being equal to itself.
 */

/** Applies a sequence of actions to a fresh chat state. */
function dispatch(...actions: UnknownAction[]): ChatState {
  return actions.reduce<ChatState>(
    (state, action) => chatReducer(state, action),
    chatReducer(undefined, { type: '@@INIT' }),
  );
}

// Restored here rather than at the end of the one test that fakes them: an
// assertion that throws never reaches a trailing call, which would leave the
// clock frozen for the rest of the file. Harmless as the cases stand — neither
// of the others reads the clock — but the failure it would cause is the kind
// that looks like it belongs to the test it surfaces in.
afterEach(() => {
  jest.useRealTimers();
});

describe('chat message ids', () => {
  test('are distinct for messages added in the same millisecond', () => {
    // Frozen, so every id below is minted from one `Date.now()`. Without the
    // sequence they are all the same string.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T00:00:00.000Z'));

    const state = dispatch(
      chatActions.addUserMessage({ text: 'first', timestamp: 'now' }),
      chatActions.addUserMessage({ text: 'second', timestamp: 'now' }),
      chatActions.addSystemMessage({ text: 'third', timestamp: 'now' }),
      chatActions.addPendingResponse({ model: 'OPENAI', timestamp: 'now' }),
      chatActions.addPendingResponse({ model: 'OPENAI', timestamp: 'now' }),
    );

    const ids = state.messages.map(message => message.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  test('keep the prefix MessageBubble reads them by', () => {
    // `MessageBubble` shows the disabled-state hint only for a system message
    // and tells one apart with `id.startsWith('system-')`. Nothing else about
    // the format is depended on, but that much is.
    const state = dispatch(
      chatActions.addUserMessage({ text: 'a', timestamp: 'now' }),
      chatActions.addSystemMessage({ text: 'b', timestamp: 'now' }),
      chatActions.addPendingResponse({ model: 'ANTHROPIC_CLAUDE', timestamp: 'now' }),
    );

    const [user, system, response] = state.messages.map(message => message.id);
    expect(user.startsWith('msg-')).toBe(true);
    expect(system.startsWith('system-')).toBe(true);
    expect(response.startsWith('resp-')).toBe(true);
    // The model stays in the id, where it has always been.
    expect(response.endsWith('-ANTHROPIC_CLAUDE')).toBe(true);
  });

  test('are minted in the action, leaving the reducer pure', () => {
    // Applying one action twice must give the same state — which is what
    // "reducers assign the payload and nothing more" means in
    // `rules/viewmodel.md`. Generating the id inside the reducer would produce
    // a different id each time the same action was replayed.
    const action = chatActions.addUserMessage({ text: 'a', timestamp: 'now' });
    const initial = chatReducer(undefined, { type: '@@INIT' });

    expect(chatReducer(initial, action)).toEqual(chatReducer(initial, action));
  });
});

/**
 * Suggestion ids, which the same fix reached and no test covered.
 *
 * Asserting that one batch's ids are distinct would not test this. They were
 * `suggestion-<time>-1..5`, numbered within the batch, so one batch was already
 * unique and stayed unique — such a case passes both before and after the fix.
 * What changed is across batches: the counter used to restart at 1 for every
 * call, so two batches generated in the same millisecond were the same five
 * strings. That is the assertion below.
 *
 * This goes through `ChatViewModel` rather than the reducer because
 * `generateSuggestions` is a private method on the class; `updateSuggestions`
 * is the public surface that reaches it.
 */
describe('chat suggestion ids', () => {
  /**
   * A view model whose store is real and whose services are never reached.
   *
   * The constructor calls `loadInitialMessage`, which only dispatches, and the
   * path under test only reads settings and messages — so neither service is
   * touched. Should that stop being true, the call throws on the spot rather
   * than reading a plausible stub value.
   * @returns The view model, and the store to read suggestions back from.
   */
  function chatViewModel(): { model: ChatViewModel; store: ReturnType<typeof createMaidrStore> } {
    const store = createMaidrStore();
    const model = new ChatViewModel(store, {} as ChatService, {} as AudioService);
    return { model, store };
  }

  test('are distinct across two batches generated in the same millisecond', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T00:00:00.000Z'));
    const { model, store } = chatViewModel();

    // The welcome message the constructor adds is a system message, so it is
    // not from the user and suggestions are generated rather than skipped.
    model.updateSuggestions();
    const first = store.getState().chat.suggestions.map(suggestion => suggestion.id);
    model.updateSuggestions();
    const second = store.getState().chat.suggestions.map(suggestion => suggestion.id);

    expect(first.length).toBeGreaterThan(0);
    expect(second).toHaveLength(first.length);
    expect(new Set([...first, ...second]).size).toBe(first.length + second.length);
  });
});
