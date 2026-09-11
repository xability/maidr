import type { AudioService } from '@service/audio';
import type { NotificationService } from '@service/notification';
import type { Command } from './command';
import { t } from '@util/i18n';
import { Platform } from '@util/platform';

/**
 * Keys that carry no MAIDR action anywhere, so pressing one is not a mistake.
 *
 * Modifiers and Caps Lock are half of a chord rather than a press of their
 * own. Tab moves focus out of the chart, and Insert, the lock keys and the
 * function row belong to the browser or the screen reader -- NVDA and JAWS
 * build their own commands on Insert, and warning there would fire on someone
 * else's shortcut. The last three are a keypress the browser could not name,
 * which usually means an IME or a dead key partway through composing a
 * character.
 */
const IGNORED_KEYS = new Set([
  'Alt',
  'CapsLock',
  'Control',
  'Meta',
  'Shift',
  'ContextMenu',
  'Insert',
  'NumLock',
  'Pause',
  'PrintScreen',
  'ScrollLock',
  'Tab',
  'Dead',
  'Process',
  'Unidentified',
]);

/** `F1` through `F12`, which the browser and the screen reader claim. */
const FUNCTION_KEY = /^F\d{1,2}$/;

/**
 * Announces that the key just pressed does nothing here, and says how to find
 * the keys that do.
 *
 * Silence was the previous answer, and silence is indistinguishable from a
 * chart that has stopped responding: a reader who guesses a key learns
 * nothing from it, least of all that a list of the real ones exists. The
 * chord is spelled out in words because a screen reader announcing
 * `Ctrl + /` may say only "control" -- punctuation is commonly skipped at
 * default verbosity -- and it names Command on macOS because that is what the
 * binding actually is there.
 *
 * Constructed directly by `KeybindingService` rather than through
 * `CommandFactory`: the factory maps a key of a scope's keymap to a command,
 * and this one answers for every key that is *not* in it.
 */
export class InvalidKeyCommand implements Command {
  private readonly notificationService: NotificationService;
  private readonly audioService: AudioService;

  /**
   * Creates an instance of InvalidKeyCommand.
   * @param notificationService - Speaks the warning.
   * @param audioService - Plays the warning tone alongside it.
   */
  public constructor(
    notificationService: NotificationService,
    audioService: AudioService,
  ) {
    this.notificationService = notificationService;
    this.audioService = audioService;
  }

  /**
   * Warns about an unassigned keypress, or stays silent if the press was
   * never aimed at MAIDR.
   * @param event - The keydown event no binding claimed.
   */
  public execute(event?: Event): void {
    if (!InvalidKeyCommand.isUnassignedPress(event)) {
      return;
    }

    this.notificationService.notify(
      t('text.invalidKey', { modifier: Platform.ctrlSpoken }),
    );
    // The conditional variant: a reader who switched sonification off asked
    // for silence, and the spoken warning lands either way.
    this.audioService.playWarningToneIfEnabled();
  }

  /**
   * Decides whether an unclaimed keypress was a reader reaching for a MAIDR
   * shortcut, as opposed to input meant for something else.
   *
   * Anything held with Ctrl, Cmd or Alt is left alone. Those chords are where
   * the browser, the operating system and the screen reader keep their own
   * commands -- VoiceOver alone owns every Ctrl+Option combination -- and
   * answering "invalid key" to a working screen-reader command would be both
   * wrong and unstoppable. Shift is not in that list: Shift and a letter is
   * still someone typing a key at the chart.
   * @param event - The event to judge.
   * @returns True when the press deserves a warning.
   */
  private static isUnassignedPress(event?: Event): boolean {
    // Duck-typed rather than `instanceof KeyboardEvent`, which is not defined
    // outside a DOM.
    const press = event as Partial<KeyboardEvent> | undefined;
    if (!press || typeof press.key !== 'string') {
      return false;
    }
    // A held-down key repeats many times a second; one warning is the answer
    // to all of them.
    if (press.repeat) {
      return false;
    }
    if (press.ctrlKey || press.metaKey || press.altKey) {
      return false;
    }
    return !IGNORED_KEYS.has(press.key) && !FUNCTION_KEY.test(press.key);
  }
}
