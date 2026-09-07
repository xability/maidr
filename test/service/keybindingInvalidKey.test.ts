/**
 * @jest-environment jsdom
 */
import type { CommandContext } from '@command/command';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { KeybindingService } from '@service/keybinding';
import { Scope } from '@type/event';

const KEY_CODE = {
  b: 66,
  q: 81,
  t: 84,
} as const;

interface Harness {
  service: KeybindingService;
  notify: jest.Mock<(message: string) => void>;
  toggleText: jest.Mock<() => void>;
}

function createService(): Harness {
  const notify = jest.fn<(message: string) => void>();
  const toggleText = jest.fn<() => void>();

  // Only the collaborators the exercised paths reach: CommandFactory just
  // stores the rest of the context.
  const commandContext = {
    notificationService: { notify },
    audioService: { playWarningToneIfEnabled: jest.fn() },
    textViewModel: { toggle: toggleText } as unknown as TextViewModel,
  } as unknown as CommandContext;

  return { service: new KeybindingService(commandContext), notify, toggleText };
}

/** Dispatches a keydown and lets the deferred unassigned-key check run. */
async function press(keyCode: number, init: KeyboardEventInit = {}): Promise<void> {
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, keyCode, ...init }),
  );
  await Promise.resolve();
}

describe('keybindingService unassigned-key warning', () => {
  let harness: Harness | null = null;

  afterEach(() => {
    harness?.service.unregister();
    harness = null;
  });

  it('warns when a key no shortcut in the scope claims is pressed', async () => {
    harness = createService();
    harness.service.register(Scope.TRACE);

    await press(KEY_CODE.q);

    expect(harness.notify).toHaveBeenCalledWith(
      expect.stringContaining('Slash for keyboard help') as unknown as string,
    );
  });

  it('stays silent when the key runs a shortcut', async () => {
    harness = createService();
    harness.service.register(Scope.TRACE);

    await press(KEY_CODE.t);

    expect(harness.toggleText).toHaveBeenCalledTimes(1);
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it('stays silent for a key bound in another scope only', async () => {
    harness = createService();
    // `b` toggles braille in TRACE; the settings dialog binds nothing at all.
    harness.service.register(Scope.SETTINGS);

    await press(KEY_CODE.b);

    expect(harness.notify).not.toHaveBeenCalled();
  });

  it('warns again on the next unassigned key', async () => {
    harness = createService();
    harness.service.register(Scope.TRACE);

    await press(KEY_CODE.q);
    await press(KEY_CODE.q);

    expect(harness.notify).toHaveBeenCalledTimes(2);
  });
});
