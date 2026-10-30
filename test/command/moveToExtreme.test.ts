import type { CommandContext } from '@command/command';
import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { NotificationService } from '@service/notification';
import type { Keys } from '@type/event';
import { CommandFactory } from '@command/factory';
import { MoveToLeftExtremeCommand, MoveToRightExtremeCommand } from '@command/move';
import { describe, expect, jest, test } from '@jest/globals';

/**
 * A context whose active trace answers the refusal question as given, and
 * the two services a refusal speaks through.
 * @param refusal What the trace refuses the jump with, or null
 * @returns The stand-ins, with spies on what the commands call
 */
function fixture(refusal: string | null): {
  context: Context;
  notification: NotificationService;
  audio: AudioService;
} {
  return {
    context: {
      extremeRefusal: jest.fn(() => refusal),
      moveToExtreme: jest.fn(),
    } as unknown as Context,
    notification: { notify: jest.fn() } as unknown as NotificationService,
    audio: { playWarningToneIfEnabled: jest.fn() } as unknown as AudioService,
  };
}

describe('jumping to the left or right extreme', () => {
  test('jumps when the trace has nothing to refuse it with', () => {
    const { context, notification, audio } = fixture(null);

    new MoveToRightExtremeCommand(context, notification, audio).execute();
    new MoveToLeftExtremeCommand(context, notification, audio).execute();

    expect(context.moveToExtreme).toHaveBeenNthCalledWith(1, 'FORWARD');
    expect(context.moveToExtreme).toHaveBeenNthCalledWith(2, 'BACKWARD');
    expect(notification.notify).not.toHaveBeenCalled();
    expect(audio.playWarningToneIfEnabled).not.toHaveBeenCalled();
  });

  test('says why there is nowhere to jump, with the warning tone, and stays put', () => {
    // On a chord diagram the largest flows go round in a cycle. The jump
    // used to land on a node of the cycle that the next arrow moved on from;
    // the edge signal would say the reader is at the end when they are not.
    const message = 'No end to go to: following the largest flow out of Asia goes round in a cycle';
    const { context, notification, audio } = fixture(message);

    new MoveToRightExtremeCommand(context, notification, audio).execute();

    expect(context.extremeRefusal).toHaveBeenCalledWith('FORWARD');
    expect(context.moveToExtreme).not.toHaveBeenCalled();
    expect(notification.notify).toHaveBeenCalledWith(message);
    expect(audio.playWarningToneIfEnabled).toHaveBeenCalledTimes(1);
  });

  test('asks about the direction it was pressed for', () => {
    const { context, notification, audio } = fixture('No start to go to');

    new MoveToLeftExtremeCommand(context, notification, audio).execute();

    expect(context.extremeRefusal).toHaveBeenCalledWith('BACKWARD');
    expect(context.moveToExtreme).not.toHaveBeenCalled();
  });

  test('the factory hands both commands what a refusal speaks through', () => {
    // The keymap names reach the commands through the factory alone, so a
    // command built without its services would fail on the first refusal.
    const { context, notification, audio } = fixture('No end to go to');
    const factory = new CommandFactory({
      context,
      notificationService: notification,
      audioService: audio,
    } as unknown as CommandContext);

    factory.create('MOVE_TO_RIGHT_EXTREME' as Keys).execute();

    expect(notification.notify).toHaveBeenCalledWith('No end to go to');
    expect(audio.playWarningToneIfEnabled).toHaveBeenCalledTimes(1);
  });
});
