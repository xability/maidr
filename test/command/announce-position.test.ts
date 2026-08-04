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

describe('AnnouncePositionCommand on multiline plots (verbose)', () => {
  test('names the group alongside the line and point position', () => {
    const { command, textViewModel } = createCommand(
      multilineState({ group: { label: 'Group', value: 'Series 1' } }),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Line 1 of 3, Group is Series 1, Position is 3 of 10',
    );
  });

  test('uses the authored z label when the spec provides one', () => {
    const { command, textViewModel } = createCommand(
      multilineState({ row: 1, group: { label: 'series', value: 'Series 2' } }),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Line 2 of 3, series is Series 2, Position is 3 of 10',
    );
  });

  test('omits group wording when the trace reports no group', () => {
    const { command, textViewModel } = createCommand(multilineState());

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Line 1 of 3, Position is 3 of 10');
  });

  test('calls each member a line, never a plot', () => {
    const { command, textViewModel } = createCommand(
      multilineState({ group: { label: 'Group', value: 'Series 1' } }),
    );

    command.execute();

    const announced = jest.mocked(textViewModel.update).mock.calls[0][0];
    expect(announced).not.toContain('Plot');
  });
});

describe('AnnouncePositionCommand on multiline plots (terse)', () => {
  test('drops the line ordinal and label words, keeping the group name', () => {
    const { command, textViewModel } = createCommand(
      multilineState({ group: { label: 'Group', value: 'Series 1' } }),
      'terse',
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Series 1, 22%');
  });

  test('falls back to the line ordinal when the data names no group', () => {
    const { command, textViewModel } = createCommand(multilineState(), 'terse');

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Line 1 of 3, 22%');
  });

  test('stays shorter than the verbose announcement for the same position', () => {
    const state = multilineState({ group: { label: 'Group', value: 'Series 1' } });
    const verbose = createCommand(state);
    const terse = createCommand(state, 'terse');

    verbose.command.execute();
    terse.command.execute();

    const verboseText = jest.mocked(verbose.textViewModel.update).mock.calls[0][0] as string;
    const terseText = jest.mocked(terse.textViewModel.update).mock.calls[0][0] as string;
    expect(terseText.length).toBeLessThan(verboseText.length);
  });
});

/**
 * Builds a multi-series step trace state as `StepTrace` reports it: the same
 * shape `LineTrace` produces, but typed `step` and naming itself `step`.
 * @param options Cursor position and group, as for {@link multilineState}
 * @returns A non-empty multi-series step trace state
 */
function multiStepState(options: MultilineOptions = {}): PlotState {
  return {
    ...(multilineState(options) as object),
    traceType: TraceType.STEP,
    plotType: 'step',
  } as unknown as PlotState;
}

describe('AnnouncePositionCommand on multi-series step plots', () => {
  it('calls a step series a series, not a line', () => {
    // The instruction text and chartType for this same chart both say "step",
    // so announcing "Line 1 of 3" here would have the chart contradict itself.
    const { command, textViewModel } = createCommand(multiStepState());

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Series 1 of 3, Position is 3 of 10',
    );
  });

  it('keeps the series wording in terse mode when the data names no group', () => {
    const { command, textViewModel } = createCommand(multiStepState(), 'terse');

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Series 1 of 3, 22%');
  });

  it('still prefers an authored group name over the ordinal', () => {
    const { command, textViewModel } = createCommand(
      multiStepState({ group: { label: 'Night', value: 'Night 2' } }),
      'terse',
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Night 2, 22%');
  });

  it('leaves a multiline chart saying line', () => {
    const { command, textViewModel } = createCommand(multilineState());

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Line 1 of 3, Position is 3 of 10');
  });
});
