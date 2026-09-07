import type { AudioService } from '@service/audio';
import type { NotificationService } from '@service/notification';
import { InvalidKeyCommand } from '@command/invalidKey';
import { describe, expect, it, jest } from '@jest/globals';
import { Platform } from '@util/platform';

interface Mocks {
  command: InvalidKeyCommand;
  notify: jest.Mock<(message: string) => void>;
  playWarningToneIfEnabled: jest.Mock<() => void>;
}

function createCommand(): Mocks {
  const notify = jest.fn<(message: string) => void>();
  const playWarningToneIfEnabled = jest.fn<() => void>();

  const command = new InvalidKeyCommand(
    { notify } as unknown as NotificationService,
    { playWarningToneIfEnabled } as unknown as AudioService,
  );

  return { command, notify, playWarningToneIfEnabled };
}

/** Builds the shape {@link InvalidKeyCommand} duck-types, without a DOM. */
function press(key: string, modifiers: Partial<KeyboardEvent> = {}): Event {
  return { key, ...modifiers } as unknown as Event;
}

describe('invalidKeyCommand.execute', () => {
  it('announces the help chord and warns by ear on an unassigned key', () => {
    const { command, notify, playWarningToneIfEnabled } = createCommand();

    command.execute(press('q'));

    expect(notify).toHaveBeenCalledTimes(1);
    expect(playWarningToneIfEnabled).toHaveBeenCalledTimes(1);
  });

  it('spells the chord out in words a screen reader will read', () => {
    const { command, notify } = createCommand();

    command.execute(press('q'));

    // Not `Ctrl + /`: a screen reader at default verbosity commonly skips the
    // punctuation, leaving the reader with half an instruction. Which of the
    // two words appears depends on the machine the suite runs on.
    expect(notify).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Invalid key\. Press (?:Control|Command) Slash for keyboard help\.$/,
      ) as unknown as string,
    );
  });

  it('names the modifier this platform actually binds help to', () => {
    const { command, notify } = createCommand();

    command.execute(press('q'));

    // `Platform.ctrl` is the token hotkeys-js binds the help chord with. The
    // announcement has to name the same physical key -- saying 'Control' on a
    // Mac would send the reader to a chord that is not bound there -- and only
    // the wording differs, since hotkeys-js takes 'ctrl' where speech wants
    // the whole word.
    const [message] = notify.mock.calls[0];
    expect(message.includes('Command')).toBe(Platform.ctrl === 'command');
  });

  it('warns on a shifted key, which is still someone typing at the chart', () => {
    const { command, notify } = createCommand();

    command.execute(press('Q', { shiftKey: true }));

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['command', { metaKey: true }],
    ['alt', { altKey: true }],
  ])('stays silent for a %s chord, which the browser or screen reader owns', (_name, modifier) => {
    const { command, notify, playWarningToneIfEnabled } = createCommand();

    command.execute(press('q', modifier));

    expect(notify).not.toHaveBeenCalled();
    expect(playWarningToneIfEnabled).not.toHaveBeenCalled();
  });

  it.each(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Insert', 'F1', 'F12'])(
    'stays silent for %s, which was never aimed at a shortcut',
    (key) => {
      const { command, notify } = createCommand();

      command.execute(press(key));

      expect(notify).not.toHaveBeenCalled();
    },
  );

  it('warns once for a held key rather than on every repeat', () => {
    const { command, notify } = createCommand();

    command.execute(press('q'));
    command.execute(press('q', { repeat: true }));
    command.execute(press('q', { repeat: true }));

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('ignores an event that is not a keypress at all', () => {
    const { command, notify } = createCommand();

    command.execute();
    command.execute({} as Event);

    expect(notify).not.toHaveBeenCalled();
  });
});
