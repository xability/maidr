import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { TextService } from '@service/text';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import {
  AnnounceXCommand,
  AnnounceYCommand,
  AnnounceZCommand,
} from '@command/describe';
import { describe, expect, jest, test } from '@jest/globals';
import { Scope } from '@type/event';

/**
 * Verifies that the axis-label announce commands (`l x`, `l y`, `l z`) treat a
 * blank/whitespace label as "not available" instead of announcing a bare
 * "X label is " with no value, keeping them consistent with the
 * title/subtitle/caption commands.
 */

interface Harness {
  command: AnnounceXCommand | AnnounceYCommand | AnnounceZCommand;
  textViewModel: { update: jest.Mock };
  audioService: { playWarningToneIfEnabled: jest.Mock };
}

/**
 * Constructor shape shared by the three axis-label announce commands, so the
 * harness can build any of them without falling back to `never[]`/`any`.
 */
type AnnounceCommandCtor = new (
  context: Context,
  textViewModel: TextViewModel,
  audioService: AudioService,
  textService: TextService,
  displayService: DisplayService,
) => AnnounceXCommand | AnnounceYCommand | AnnounceZCommand;

function createContext(state: Record<string, unknown>): Context {
  return {
    scope: Scope.TRACE_LABEL,
    state,
  } as unknown as Context;
}

function createHarness(
  CommandClass: AnnounceCommandCtor,
  state: Record<string, unknown>,
  terse = false,
): Harness {
  const context = createContext(state);
  const textViewModel = { update: jest.fn() } as { update: jest.Mock };
  const audioService = {
    playWarningToneIfEnabled: jest.fn(),
  } as { playWarningToneIfEnabled: jest.Mock };
  const textService = { isTerse: jest.fn(() => terse) } as unknown as TextService;
  const displayService = { exitLabelScope: jest.fn() } as unknown as DisplayService;

  const command = new CommandClass(
    context,
    textViewModel as unknown as TextViewModel,
    audioService as unknown as AudioService,
    textService,
    displayService,
  );
  return { command, textViewModel, audioService };
}

describe('AnnounceXCommand', () => {
  test('announces the authored X label', () => {
    const { command, textViewModel, audioService } = createHarness(
      AnnounceXCommand,
      { type: 'trace', empty: false, xAxis: 'Month' },
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('X label is Month');
    expect(audioService.playWarningToneIfEnabled).not.toHaveBeenCalled();
  });

  test.each(['', '   '])(
    'announces "not available" for a blank X label (%p) and plays a warning tone',
    (xAxis) => {
      const { command, textViewModel, audioService } = createHarness(
        AnnounceXCommand,
        { type: 'trace', empty: false, xAxis },
      );

      command.execute();

      expect(textViewModel.update).toHaveBeenCalledWith('X label is not available');
      expect(audioService.playWarningToneIfEnabled).toHaveBeenCalled();
    },
  );
});

describe('AnnounceYCommand', () => {
  test('announces the authored Y label', () => {
    const { command, textViewModel, audioService } = createHarness(
      AnnounceYCommand,
      { type: 'trace', empty: false, yAxis: 'Values' },
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Y label is Values');
    expect(audioService.playWarningToneIfEnabled).not.toHaveBeenCalled();
  });

  test('announces "not available" for a blank Y label and plays a warning tone', () => {
    const { command, textViewModel, audioService } = createHarness(
      AnnounceYCommand,
      { type: 'trace', empty: false, yAxis: '' },
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Y label is not available');
    expect(audioService.playWarningToneIfEnabled).toHaveBeenCalled();
  });

  test('announces the bare label in terse mode', () => {
    const { command, textViewModel } = createHarness(
      AnnounceYCommand,
      { type: 'trace', empty: false, yAxis: 'Values' },
      true,
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Values');
  });
});

describe('AnnounceZCommand', () => {
  test('announces the authored Z label', () => {
    const { command, textViewModel, audioService } = createHarness(
      AnnounceZCommand,
      { type: 'trace', empty: false, text: { z: { label: 'Trend', value: 'Bullish' } } },
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Z label is Trend');
    expect(audioService.playWarningToneIfEnabled).not.toHaveBeenCalled();
  });

  test('announces "not available" for a blank Z label and plays a warning tone', () => {
    const { command, textViewModel, audioService } = createHarness(
      AnnounceZCommand,
      { type: 'trace', empty: false, text: { z: { label: '', value: 'Bullish' } } },
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Z label is not available');
    expect(audioService.playWarningToneIfEnabled).toHaveBeenCalled();
  });

  test('announces "not available" when there is no Z data', () => {
    const { command, textViewModel, audioService } = createHarness(
      AnnounceZCommand,
      { type: 'trace', empty: false, text: {} },
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Z label is not available');
    expect(audioService.playWarningToneIfEnabled).toHaveBeenCalled();
  });
});
