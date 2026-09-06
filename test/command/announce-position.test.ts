import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { TextService } from '@service/text';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { BarPoint, BoxPoint, CandlestickPoint, SegmentedPoint, ViolinKdePoint } from '@type/grammar';
import type { PlotState } from '@type/state';
import { AnnouncePositionCommand } from '@command/describe';
import { describe, expect, jest, test } from '@jest/globals';
import { CANDLESTICK_SECTIONS } from '@model/candlestick';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

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

/**
 * A real bar trace's state with the cursor on one bar, drawn either way up.
 *
 * `audio.panning` is a stereo position, and a horizontal bar plot swaps it so
 * the pan follows the bars down the page. Building the state from the trace
 * rather than by hand is what lets these cases catch the command reading that
 * pan as a bar index.
 *
 * @param orientation Which way the bars run
 * @param bar Zero-based index of the bar the cursor is on
 * @returns The trace's state with the cursor there
 */
function barTraceState(orientation: Orientation, bar: number): PlotState {
  const categories = ['North', 'South', 'West'];
  const magnitudes = [4, 8, 6];
  const trace = TraceFactory.create({
    id: 'position-bar',
    type: TraceType.BAR,
    title: 'Sales',
    orientation,
    axes: { x: { label: 'Region' }, y: { label: 'Sales' } },
    data: categories.map((category, i) =>
      orientation === Orientation.HORIZONTAL
        ? { x: magnitudes[i], y: category }
        : { x: category, y: magnitudes[i] },
    ) as BarPoint[],
  });
  trace.moveToIndex(0, bar);

  return trace.state as PlotState;
}

/**
 * A real stacked bar trace's state, drawn either way up.
 *
 * @param orientation Which way the bars run
 * @param level Zero-based index of the stack level the cursor is on
 * @param category Zero-based index of the category the cursor is on
 * @returns The trace's state with the cursor there
 */
function stackedTraceState(
  orientation: Orientation,
  level: number,
  category: number,
): PlotState {
  // Four categories against two levels (three rows, once the summary row is
  // added), so a level index or level count read as a category shows up.
  const categories = ['a', 'b', 'c', 'd'];
  const levels = ['Low', 'High'];
  const trace = TraceFactory.create({
    id: 'position-stacked',
    type: TraceType.STACKED,
    title: 'Stacked',
    orientation,
    axes: { x: { label: 'Category' }, y: { label: 'Count' } },
    data: levels.map((z, row) =>
      categories.map((category, col) => {
        const magnitude = row * 10 + col + 1;
        return orientation === Orientation.HORIZONTAL
          ? { x: magnitude, y: category, z }
          : { x: category, y: magnitude, z };
      }),
    ) as SegmentedPoint[][],
  });
  trace.moveToIndex(level, category);

  return trace.state as PlotState;
}

describe('AnnouncePositionCommand on horizontal bar charts', () => {
  test('announces the bar index on a horizontal bar chart, as on a vertical one', () => {
    const vertical = createCommand(barTraceState(Orientation.VERTICAL, 1));
    const horizontal = createCommand(barTraceState(Orientation.HORIZONTAL, 1));

    vertical.command.execute();
    horizontal.command.execute();

    expect(vertical.textViewModel.update).toHaveBeenCalledWith('Position is 2 of 3');
    expect(horizontal.textViewModel.update).toHaveBeenCalledWith('Position is 2 of 3');
  });

  test('moves the announced position with the cursor on a horizontal bar chart', () => {
    const first = createCommand(barTraceState(Orientation.HORIZONTAL, 0));
    const last = createCommand(barTraceState(Orientation.HORIZONTAL, 2));

    first.command.execute();
    last.command.execute();

    expect(first.textViewModel.update).toHaveBeenCalledWith('Position is 1 of 3');
    expect(last.textViewModel.update).toHaveBeenCalledWith('Position is 3 of 3');
  });

  test('gives the terse percentage along the bars, not across them', () => {
    const { command, textViewModel } = createCommand(
      barTraceState(Orientation.HORIZONTAL, 2),
      'terse',
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('100%');
  });

  test('announces the category, not the level, on a horizontal stacked bar', () => {
    const { command, textViewModel } = createCommand(
      stackedTraceState(Orientation.HORIZONTAL, 0, 2),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Position is 3 of 4, Level is Low',
    );
  });

  test('reads a vertical stacked bar the same way it always has', () => {
    const { command, textViewModel } = createCommand(
      stackedTraceState(Orientation.VERTICAL, 0, 2),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Position is 3 of 4, Level is Low',
    );
  });
});

/**
 * A real violin box trace's state. Its audio panning encodes the value, as a
 * boxplot's does, so the position has to come from the same place the
 * boxplot branch reads it.
 *
 * @param orientation Which way the violins run
 * @param section Section index, in the trace's own section order
 * @param violin Zero-based index of the violin the cursor is on
 * @returns The trace's state with the cursor there
 */
function violinBoxTraceState(
  orientation: Orientation,
  section: number,
  violin: number,
): PlotState {
  const trace = TraceFactory.create({
    id: 'position-violin-box',
    type: TraceType.VIOLIN_BOX,
    title: 'Violins',
    orientation,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    data: [
      { z: 'A', lowerOutliers: [], min: 1, q1: 3, q2: 5, q3: 7, max: 9, upperOutliers: [] },
      { z: 'B', lowerOutliers: [], min: 2, q1: 4, q2: 6, q3: 8, max: 10, upperOutliers: [] },
    ] as BoxPoint[],
  });
  if (orientation === Orientation.HORIZONTAL) {
    trace.moveToIndex(violin, section);
  } else {
    trace.moveToIndex(section, violin);
  }

  return trace.state as PlotState;
}

describe('AnnouncePositionCommand on a violin box', () => {
  test('announces which violin the cursor is on, with its section', () => {
    const state = violinBoxTraceState(Orientation.VERTICAL, 0, 1);
    const { command, textViewModel } = createCommand(state);

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      `Position is 2 of 2 in ${sectionOf(state)}`,
    );
  });

  test('changes the announcement when the cursor moves to another violin', () => {
    const first = createCommand(violinBoxTraceState(Orientation.VERTICAL, 2, 0));
    const second = createCommand(violinBoxTraceState(Orientation.VERTICAL, 2, 1));

    first.command.execute();
    second.command.execute();

    const firstText = jest.mocked(first.textViewModel.update).mock.calls[0][0] as string;
    const secondText = jest.mocked(second.textViewModel.update).mock.calls[0][0] as string;
    expect(firstText).toContain('Position is 1 of 2');
    expect(secondText).toContain('Position is 2 of 2');
  });

  test('reads the violin index on a horizontal violin box too', () => {
    const state = violinBoxTraceState(Orientation.HORIZONTAL, 0, 1);
    const { command, textViewModel } = createCommand(state);

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      `Position is 2 of 2 in ${sectionOf(state)}`,
    );
  });
});

/**
 * A real violin KDE trace's state: three violins of five density samples.
 *
 * @param violin Zero-based index of the violin the cursor is on
 * @param sample Zero-based index of the density sample within it
 * @param orientation Which way the violins are laid out
 * @returns The trace's state with the cursor there
 */
function violinKdeTraceState(
  violin: number,
  sample: number,
  orientation = Orientation.VERTICAL,
): PlotState {
  const trace = TraceFactory.create({
    id: 'position-violin-kde',
    type: TraceType.VIOLIN_KDE,
    title: 'Violins',
    orientation,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    data: ['A', 'B', 'C'].map(x =>
      [1, 2, 3, 4, 5].map(y => ({ x, y, density: 0.1 * y })),
    ) as ViolinKdePoint[][],
  });
  trace.moveToIndex(violin, sample);

  return trace.state as PlotState;
}

describe('AnnouncePositionCommand on a multi-violin KDE', () => {
  test('names the violin rather than a column and row', () => {
    const { command, textViewModel } = createCommand(violinKdeTraceState(1, 2));

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Violin 2 of 3, Position is 3 of 5',
    );
  });

  test('keeps the violin identity in terse mode', () => {
    const { command, textViewModel } = createCommand(violinKdeTraceState(1, 2), 'terse');

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Violin 2 of 3, 50%');
  });

  /**
   * The cursor is on the same violin and the same sample either way round, so
   * the announcement is too. It is the stereo pan that turns with the layout:
   * a vertical violin pans by violin and holds still while the reader climbs
   * one curve, a horizontal one pans along the curve. Reading the position out
   * of that pan is what made the vertical case answer with its two numbers
   * swapped.
   */
  test('reads the same violin and sample whichever way the violins are laid out', () => {
    const vertical = createCommand(violinKdeTraceState(1, 2, Orientation.VERTICAL));
    const horizontal = createCommand(violinKdeTraceState(1, 2, Orientation.HORIZONTAL));

    vertical.command.execute();
    horizontal.command.execute();

    expect(vertical.textViewModel.update).toHaveBeenCalledWith(
      'Violin 2 of 3, Position is 3 of 5',
    );
    expect(horizontal.textViewModel.update).toHaveBeenCalledWith(
      'Violin 2 of 3, Position is 3 of 5',
    );
  });
});

/**
 * A violin KDE trace with a single violin of five density samples.
 *
 * @param sample Zero-based index of the density sample the cursor is on
 * @param orientation Which way the violin is laid out
 * @returns The trace's state with the cursor there
 */
function singleViolinKdeTraceState(
  sample: number,
  orientation = Orientation.VERTICAL,
): PlotState {
  const trace = TraceFactory.create({
    id: 'position-single-violin-kde',
    type: TraceType.VIOLIN_KDE,
    title: 'Violin',
    orientation,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    data: [[1, 2, 3, 4, 5].map(y => ({ x: 'A', y, density: 0.1 * y }))] as ViolinKdePoint[][],
  });
  trace.moveToIndex(0, sample);

  return trace.state as PlotState;
}

describe('AnnouncePositionCommand on a single-violin KDE', () => {
  /**
   * One violin is a curve, not a set of them, so the announcement is the
   * plain position along it and names no violin at all.
   *
   * Which branch it takes turns on the row count, so the frame that count is
   * read from matters here as much as the numbers do. A vertical violin's pan
   * reports the sample count as its rows and the violin count as its columns,
   * and reading the position out of that answered "Violin 3 of 5, Position is
   * 1 of 1" -- five violins where there is one, and a curve one sample long.
   * The horizontal case passed either way, which is why it is here beside it.
   */
  test.each([
    ['vertical', Orientation.VERTICAL],
    ['horizontal', Orientation.HORIZONTAL],
  ])('reads the position along a %s curve without naming a violin', (_name, orientation) => {
    const { command, textViewModel } = createCommand(
      singleViolinKdeTraceState(2, orientation),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Position is 3 of 5');
  });
});

describe('AnnouncePositionCommand at the multi-panel lobby', () => {
  function figureState(index: number, size: number): PlotState {
    return { type: 'figure', empty: false, index, size } as unknown as PlotState;
  }

  test('announces which subplot is focused', () => {
    // The lobby binds `p` and lists it in help, so it has to answer with the
    // position the figure state already carries rather than a refusal.
    const { command, textViewModel } = createCommand(figureState(2, 4));

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Subplot 2 of 4');
  });

  test('drops the label word in terse mode', () => {
    const { command, textViewModel } = createCommand(figureState(2, 4), 'terse');

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('2 of 4');
  });

  test('still refuses when there is no chart at all', () => {
    const { command, textViewModel } = createCommand(
      { type: 'figure', empty: true } as unknown as PlotState,
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Not in a chart, unable to show position.',
    );
  });
});
