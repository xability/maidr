import { describe, expect, test } from '@jest/globals';
import textReducer from '@state/viewModel/textViewModel';

/**
 * These reducer-level tests lock in the re-announcement mechanism the rotor
 * boundary messages depend on: the screen-reader alert region in Text.tsx is
 * keyed by `revision`, so `revision` must change on every dispatch that should
 * re-announce — including repeated identical `notify` messages (e.g. holding a
 * direction key at a rotor boundary). Redux Toolkit exposes reducers by the
 * `${slice}/${reducer}` action type, so the actions are dispatched by type
 * here (the slice does not export them individually).
 */
describe('text slice revision counter', () => {
  test('notify bumps revision even when the message is identical', () => {
    const initial = textReducer(undefined, { type: '@@INIT' });
    expect(initial.revision).toBe(0);

    const first = textReducer(initial, { type: 'text/notify', payload: 'No higher value found' });
    expect(first.message).toBe('No higher value found');
    expect(first.revision).toBe(1);

    // Repeating the SAME message must still advance revision so the alert
    // region re-mounts and re-announces.
    const second = textReducer(first, { type: 'text/notify', payload: 'No higher value found' });
    expect(second.message).toBe('No higher value found');
    expect(second.revision).toBe(2);

    const third = textReducer(second, { type: 'text/notify', payload: 'No higher value found' });
    expect(third.revision).toBe(3);
  });

  test('update continues to bump revision (unchanged behavior)', () => {
    const initial = textReducer(undefined, { type: '@@INIT' });
    const updated = textReducer(initial, { type: 'text/update', payload: 'Bar 1 of 5' });
    expect(updated.value).toBe('Bar 1 of 5');
    expect(updated.revision).toBe(1);
  });
});
