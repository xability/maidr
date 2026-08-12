import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { TextService } from '@service/text';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { BoxPoint, CandlestickPoint } from '@type/grammar';
import type { PlotState } from '@type/state';
import { AnnouncePositionCommand } from '@command/describe';
import { describe, expect, jest, test } from '@jest/globals';
import { CANDLESTICK_SECTIONS } from '@model/candlestick';
import { TraceFactory } from '@model/factory';
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

  test('calls a slice that fills the dial the whole circle', () => {
    // One slice starts and ends at 12, so the point branch would announce the
    // entire circle as a single position -- the opposite of what it is.
    const { command, textViewModel } = createCommand(pieState([100], 0));

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Position is 1 of 1, the whole circle',
    );
  });

  test('still calls the dial whole when the rest of it is gaps', () => {
    // A gap and a zero are drawn as nothing, so a slice beside them is the
    // entire basis and the plain reading is the true one.
    const { command, textViewModel } = createCommand(
      pieState([100, Number.NaN, 0], 0),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Position is 1 of 3, the whole circle',
    );
  });

  test('qualifies a slice that only rounds to the full turn', () => {
    // 199 of 200 is 11.94 hours, so both ends still round to 12 and this must
    // not read as a point. But the second slice is drawn, however thin, and
    // "1 of 2, the whole circle" would contradict itself in one sentence.
    const { command, textViewModel } = createCommand(pieState([199, 1], 0));

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Position is 1 of 2, nearly the whole circle',
    );
  });

  test('qualifies it however many slices share the remainder', () => {
    // 1150 of 1152 rounds to the full turn while two other slices exist to be
    // navigated to -- the case the per-slice threshold has to get right.
    const { command, textViewModel } = createCommand(pieState([1150, 1, 1], 0));

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Position is 1 of 3, nearly the whole circle',
    );
  });

  test('gives a gap between measured slices no arc of its own', () => {
    // A gap is NaN rather than 0, and it is not drawn, so the slice after it
    // must sit where it would if the gap were absent from the data.
    const gapped = createCommand(pieState([1, Number.NaN, 1, 1], 2));
    const gapless = createCommand(pieState([1, 1, 1], 1));

    gapped.command.execute();
    gapless.command.execute();

    expect(gapped.textViewModel.update).toHaveBeenCalledWith(
      'Position is 3 of 4, from 4 o\'clock to 8 o\'clock',
    );
    expect(gapless.textViewModel.update).toHaveBeenCalledWith(
      'Position is 2 of 3, from 4 o\'clock to 8 o\'clock',
    );
  });
});

/**
 * Builds a multi-series radar trace state as {@link RadarTrace} reports it:
 * the shape `LineTrace` produces, typed `radar` and naming itself `radar`.
 * @param options Cursor position and group, as for {@link multilineState}
 * @returns A non-empty multi-series radar trace state
 */
function multiRadarState(options: MultilineOptions = {}): PlotState {
  return {
    ...(multilineState(options) as object),
    traceType: TraceType.RADAR,
    plotType: 'radar',
  } as unknown as PlotState;
}

describe('AnnouncePositionCommand on multi-series radar plots', () => {
  it('names the series rather than falling through to row and column', () => {
    // A radar extends the line trace and reports its groups the same way, but
    // its own trace type -- so without a branch it lands on the generic 2-D
    // announcement, "column 3 of 10, row 1 of 3", and the series name a reader
    // needs to know which outline they are tracing is dropped.
    const { command, textViewModel } = createCommand(
      multiRadarState({ group: { label: 'Model', value: 'Model B' } }),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Series 1 of 3, Model is Model B, Position is 3 of 10',
    );
  });

  it('calls it a series rather than a line', () => {
    // The instruction text and chartType for this same chart both say "radar".
    const { command, textViewModel } = createCommand(multiRadarState());

    command.execute();

    const announced = jest.mocked(textViewModel.update).mock.calls[0][0] as string;
    expect(announced).toContain('Series 1 of 3');
    expect(announced).not.toContain('Line');
  });
});

/**
 * A real box trace's state, so the section string under test is the one the
 * trace actually reports rather than one the fixture invented.
 *
 * The point of these cases is that two announcements about the same position
 * name the section the same way, and a hand-written `section` would let the
 * fixture decide the thing being asserted.
 *
 * @param section Row index -- the section, in `BoxplotSection` order
 * @param box Column index -- which distribution
 * @returns The trace's state with the cursor there
 */
function boxTraceState(section: number, box: number): PlotState {
  const trace = TraceFactory.create({
    id: 'position-box',
    type: TraceType.BOX,
    title: 'Sepal width',
    axes: { x: { label: 'Species' }, y: { label: 'Value' } },
    data: [
      {
        z: 'Setosa',
        lowerOutliers: [1.1],
        min: 2,
        q1: 3,
        q2: 4,
        q3: 5,
        max: 6,
        upperOutliers: [9.4],
      },
      {
        z: 'Virginica',
        lowerOutliers: [],
        min: 4,
        q1: 5,
        q2: 6,
        q3: 7,
        max: 8,
        upperOutliers: [],
      },
    ] as BoxPoint[],
  });
  trace.moveToIndex(section, box);

  return trace.state as PlotState;
}

/**
 * A real candlestick trace's state, for the sections authored in lower case.
 *
 * @param section Row index, in `CANDLESTICK_SECTIONS` order
 * @param candle Column index
 * @returns The trace's state with the cursor there
 */
function candlestickTraceState(section: number, candle: number): PlotState {
  const trace = TraceFactory.create({
    id: 'position-candle',
    type: TraceType.CANDLESTICK,
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data: [
      { value: '2026-01-01', open: 10, high: 15, low: 9, close: 14, volume: 100, trend: 'Bull', volatility: 6 },
      { value: '2026-01-02', open: 14, high: 18, low: 13, close: 17, volume: 120, trend: 'Bull', volatility: 5 },
      { value: '2026-01-03', open: 17, high: 19, low: 12, close: 13, volume: 90, trend: 'Bear', volatility: 7 },
    ] as CandlestickPoint[],
  });
  trace.moveToIndex(section, candle);

  return trace.state as PlotState;
}

/**
 * The section the trace reports at this position.
 * @param state A non-empty trace state
 * @returns The section string
 */
function sectionOf(state: PlotState): string {
  return (state as unknown as { text: { section?: string } }).text.section ?? '';
}

describe('AnnouncePositionCommand names a section as the trace authored it', () => {
  // The per-point announcement renders `section` verbatim (#830). This command
  // lower-cased it, so pressing the position key on a box plot answered
  // "in minimum" about the section that had just called itself "Minimum" --
  // the same defect #830 describes, one code path further along.

  test('keeps a box section verbatim in verbose', () => {
    const state = boxTraceState(1, 1);
    const { command, textViewModel } = createCommand(state);

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Position is 2 of 2 in Minimum');
  });

  test('keeps a box section verbatim in terse', () => {
    const state = boxTraceState(1, 1);
    const { command, textViewModel } = createCommand(state, 'terse');

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('100%, Minimum');
  });

  test('announces whatever the trace reports, for every box section', () => {
    // The contract rather than one string: this command does not get to
    // decide the case of a label it did not author. Outliers are the section
    // whose label is two words, so it is the one a re-cased reading garbles
    // most visibly.
    for (const row of [0, 1, 2, 6]) {
      const state = boxTraceState(row, 0);
      const { command, textViewModel } = createCommand(state);

      command.execute();

      const announced = jest.mocked(textViewModel.update).mock.calls[0][0] as string;
      expect(sectionOf(state)).not.toBe('');
      expect(announced).toContain(sectionOf(state));
    }
  });

  test('leaves a candlestick section alone, which authors its own in lower case', () => {
    // The same expression guarded both traces, and this one reads identically
    // either way -- so it is the case that shows nothing else moved.
    const state = candlestickTraceState(CANDLESTICK_SECTIONS.indexOf('close'), 1);
    const { command, textViewModel } = createCommand(state);

    command.execute();

    expect(sectionOf(state)).toBe('close');
    expect(textViewModel.update).toHaveBeenCalledWith('Position is 2 of 3, close');
  });
});
