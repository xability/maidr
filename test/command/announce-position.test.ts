import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { TextService } from '@service/text';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { PlotState } from '@type/state';
import { AnnouncePositionCommand } from '@command/describe';
import { describe, expect, jest, test } from '@jest/globals';
import { TraceType } from '@type/grammar';

interface MultilineOptions {
  /** Zero-based index of the line the cursor is on. */
  row?: number;
  /** Zero-based index of the point within that line. */
  col?: number;
  /** Group the trace reports for the current line, if any. */
  group?: { label: string; value: string };
}

/**
 * Builds a multiline trace state as `LineTrace` reports it.
 */
function multilineState({ row = 0, col = 2, group }: MultilineOptions = {}): PlotState {
  return {
    empty: false,
    type: 'trace',
    traceType: TraceType.LINE,
    plotType: 'multiline',
    groupCount: 3,
    ...(group && { group }),
    audio: {
      panning: { x: col, y: row, rows: 3, cols: 10 },
    },
    text: {
      main: { label: 'X values', value: col + 1 },
      cross: { label: 'Y values', value: 5 },
    },
  } as unknown as PlotState;
}

function createMockContext(state: PlotState): Context {
  return { state } as unknown as Context;
}

function createMockTextViewModel(): TextViewModel {
  return {
    update: jest.fn(),
    warnIfTextOff: jest.fn(() => false),
  } as unknown as TextViewModel;
}

function createMockTextService(mode: 'verbose' | 'terse' = 'verbose'): TextService {
  return {
    isTerse: () => mode === 'terse',
    isOff: () => false,
  } as unknown as TextService;
}

function createCommand(
  state: PlotState,
  mode: 'verbose' | 'terse' = 'verbose',
): { command: AnnouncePositionCommand; textViewModel: TextViewModel } {
  const textViewModel = createMockTextViewModel();
  const command = new AnnouncePositionCommand(
    createMockContext(state),
    createMockTextService(mode),
    textViewModel,
    {} as unknown as AudioService,
    {} as unknown as DisplayService,
  );
  return { command, textViewModel };
}

describe('AnnouncePositionCommand on multiline plots', () => {
  test('names the group alongside the plot and point position', () => {
    const { command, textViewModel } = createCommand(
      multilineState({ group: { label: 'Group', value: 'Series 1' } }),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Plot 1 of 3, Group is Series 1, Position is 3 of 10',
    );
  });

  test('uses the authored z label when the spec provides one', () => {
    const { command, textViewModel } = createCommand(
      multilineState({ row: 1, group: { label: 'series', value: 'Series 2' } }),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Plot 2 of 3, series is Series 2, Position is 3 of 10',
    );
  });

  test('announces the bare group name in terse mode', () => {
    const { command, textViewModel } = createCommand(
      multilineState({ group: { label: 'Group', value: 'Series 1' } }),
      'terse',
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Plot 1 of 3, Series 1, 22%');
  });

  test('omits group wording when the trace reports no group', () => {
    const { command, textViewModel } = createCommand(multilineState());

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Plot 1 of 3, Position is 3 of 10');
  });
});
