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

/**
 * Builds a pie trace state as `PieTrace` reports it.
 *
 * The angles are read from the braille row, the same route the boxplot branch
 * takes for its own trace-specific data, so this mirrors what the trace
 * actually puts there rather than inventing a shape.
 */
function pieState(values: number[], col: number): PlotState {
  return {
    empty: false,
    type: 'trace',
    traceType: TraceType.PIE,
    plotType: 'pie',
    audio: { panning: { x: 0, y: 0, rows: 1, cols: 2 } },
    braille: {
      empty: false,
      id: 'pie',
      values: [values],
      min: [Math.min(...values)],
      max: [Math.max(...values)],
      row: 0,
      col,
    },
    text: {
      main: { label: 'Fruit', value: 'A' },
      cross: { label: 'Units', value: values[col] },
    },
  } as unknown as PlotState;
}

describe('AnnouncePositionCommand on a pie', () => {
  test('places the slice on the dial, not just in the order', () => {
    // Four equal slices, so each is exactly a quarter turn: 12 to 3, 3 to 6,
    // 6 to 9, 9 back to 12. Chosen so the arithmetic is checkable by eye.
    const { command, textViewModel } = createCommand(pieState([1, 1, 1, 1], 0));

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Position is 1 of 4, from 12 o\'clock to 3 o\'clock',
    );
  });

  test('carries on round the dial rather than restarting each slice', () => {
    const { command, textViewModel } = createCommand(pieState([1, 1, 1, 1], 2));

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Position is 3 of 4, from 6 o\'clock to 9 o\'clock',
    );
  });

  test('reads the last slice as ending at 12, not at 0', () => {
    const { command, textViewModel } = createCommand(pieState([1, 1, 1, 1], 3));

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Position is 4 of 4, from 9 o\'clock to 12 o\'clock',
    );
  });

  test('reads a slice thinner than an hour as a point', () => {
    // 1 out of 200 is under a thirtieth of an hour, so its start and end round
    // together; "from 12 o'clock to 12 o'clock" would say nothing.
    const { command, textViewModel } = createCommand(pieState([1, 199], 0));

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Position is 1 of 2, at 12 o\'clock',
    );
  });

  test('measures a negative slice by the arc it occupies', () => {
    // The wedge for -1 is drawn a quarter of the way round like any other, so
    // the slices after it must not shift.
    const { command, textViewModel } = createCommand(pieState([1, -1, 1, 1], 2));

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Position is 3 of 4, from 6 o\'clock to 9 o\'clock',
    );
  });

  test('says only where it is when text is terse', () => {
    const { command, textViewModel } = createCommand(pieState([1, 1, 1, 1], 1), 'terse');

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('from 3 o\'clock to 6 o\'clock');
  });

  test('falls back to the ordinal when nothing is drawn', () => {
    // An all-gap pie has no dial to place anything on, and dividing by its
    // basis would be 0/0.
    const { command, textViewModel } = createCommand(pieState([0, 0], 0));

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Position is 1 of 2');
  });
});
