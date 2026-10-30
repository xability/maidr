import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { TextService } from '@service/text';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { MaidrLayer } from '@type/grammar';
import type { PlotState } from '@type/state';
import { AnnouncePositionCommand } from '@command/describe';
import { describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Where `p` says the reader is, on traces whose pan is not an index.
 *
 * The position was read from the stereo pan, and these traces pan by where a
 * point is drawn: a radar by the sine of a spoke's angle ("Position is
 * 1.9330127018922194 of 2"), a gantt by the fraction of the time axis
 * ("column 1.18 of 2"), a sequence diagram by the lane a message arrives at,
 * a ROC curve by its x. A tree panned across its whole depth, so a lone card
 * in a kanban's second column was "column 3 of 4" where left and right said
 * there was nothing beside it.
 *
 * Built from real traces: a hand-made state with an index for a pan is what
 * let this through.
 */

/**
 * What `p` announces on a state.
 *
 * @param state - The trace state
 * @param mode - The text mode
 * @returns The announcement
 */
function announce(state: PlotState, mode: 'verbose' | 'terse' = 'verbose'): string {
  const update = jest.fn();
  const command = new AnnouncePositionCommand(
    { state } as unknown as Context,
    { isTerse: () => mode === 'terse', isOff: () => false } as unknown as TextService,
    { update, warnIfTextOff: () => false } as unknown as TextViewModel,
    {} as unknown as AudioService,
    {} as unknown as DisplayService,
  );
  command.execute();
  return String(update.mock.calls[0][0]);
}

/**
 * A trace's state with the cursor at a cell.
 *
 * @param layer - The layer
 * @param row - The row
 * @param col - The column
 * @returns The state
 */
function at(layer: MaidrLayer, row: number, col: number): PlotState {
  const trace = TraceFactory.create(layer);
  trace.moveToIndex(row, col);
  return trace.state;
}

describe('a radar', () => {
  test('is at a spoke of its spokes', () => {
    const layer = {
      id: 'radar',
      type: TraceType.RADAR,
      axes: { x: { label: 'Skill' }, y: { label: 'Score' } },
      data: [
        [{ x: 'a', y: 1, fill: 'P' }, { x: 'b', y: 2, fill: 'P' }, { x: 'c', y: 3, fill: 'P' }, { x: 'd', y: 4, fill: 'P' }],
        [{ x: 'a', y: 2, fill: 'Q' }, { x: 'b', y: 3, fill: 'Q' }, { x: 'c', y: 4, fill: 'Q' }, { x: 'd', y: 1, fill: 'Q' }],
      ],
    } as unknown as MaidrLayer;

    expect(announce(at(layer, 1, 1))).toMatch(/^Series 2 of 2, .*Position is 2 of 4$/);
    expect(announce(at(layer, 1, 0), 'terse')).toMatch(/, 0%$/);
  });

  test('of one series is at a spoke of its spokes', () => {
    const layer = {
      id: 'radar',
      type: TraceType.RADAR,
      data: [[{ x: 'a', y: 1 }, { x: 'b', y: 2 }, { x: 'c', y: 3 }]],
    } as unknown as MaidrLayer;

    expect(announce(at(layer, 0, 1))).toBe('Position is 2 of 3');
  });
});

describe('a gantt chart', () => {
  test('is at an interval of its lane, and a lane of one task keeps its row', () => {
    const layer = {
      id: 'gantt',
      type: TraceType.GANTT,
      orientation: Orientation.HORIZONTAL,
      data: {
        points: [
          [{ x: 'Design', start: 0, end: 30 }, { x: 'Design', start: 60, end: 75 }],
          [{ x: 'Build', start: 30, end: 100 }],
        ],
      },
    } as unknown as MaidrLayer;

    expect(announce(at(layer, 0, 1))).toBe('Position is column 2 of 2, row 1 of 2');
    // "Position is 1 of 1" before: the row the reader was on was dropped.
    expect(announce(at(layer, 1, 0))).toBe('Position is column 1 of 1, row 2 of 2');
  });

  test('on a lane with no interval is at a lane of the lanes, never "of 0"', () => {
    // An empty lane is a row the data shape exists to express; its braille
    // row is empty, so it has no column to name.
    const lane = {
      ...at({
        id: 'gantt',
        type: TraceType.GANTT,
        data: { points: [[{ x: 'Design', start: 0, end: 30 }]] },
      } as unknown as MaidrLayer, 0, 0),
    } as PlotState & { braille: object };
    lane.braille = { empty: false, id: 'gantt', values: [[30], [], [70]], min: [30, 0, 70], max: [30, 0, 70], row: 1, col: 0 };

    expect(announce(lane)).toBe('Position is 2 of 3');
  });
});

describe('an interval chart drawn sideways', () => {
  test('is at a study of the studies and a section of its interval, as when drawn upright', () => {
    // Left and Right walk the studies and Up and Down the lower bound, the
    // estimate and the upper bound in either orientation. Read from the pan,
    // which turns on its side for the drawing, the first study's estimate
    // was "column 2 of 5, row 1 of 3".
    const studies = [
      { x: 'Silva 2018', y: 0.62, yMin: 0.41, yMax: 0.94 },
      { x: 'Nguyen 2020', y: 1.34, yMin: 0.98, yMax: 1.83 },
      { x: 'Okafor 2022', y: 1.71, yMin: 1.22, yMax: 2.4 },
      { x: 'Haddad 2023', y: 1.05, yMin: 0.6, yMax: 1.84 },
      { x: 'Pooled', y: 1.28, yMin: 1.02, yMax: 1.61, pooled: true },
    ];
    const forest = {
      id: 'forest',
      type: TraceType.FOREST,
      orientation: Orientation.HORIZONTAL,
      axes: { x: { label: 'Odds ratio' }, y: { label: 'Study' } },
      data: studies,
    } as unknown as MaidrLayer;
    const upright = { ...forest, orientation: Orientation.VERTICAL } as MaidrLayer;

    expect(announce(at(forest, 1, 0))).toBe('Position is column 1 of 5, row 2 of 3');
    expect(announce(at(forest, 2, 3))).toBe('Position is column 4 of 5, row 3 of 3');
    expect(announce(at(forest, 2, 3))).toBe(announce(at(upright, 2, 3)));
    expect(announce(at(forest, 0, 4), 'terse')).toBe('100%, 0%');
  });

  test('of error bars is at a sample of the samples', () => {
    const layer = {
      id: 'errors',
      type: TraceType.ERROR_BAR,
      orientation: Orientation.HORIZONTAL,
      data: [
        { x: 'A', y: 1.24, yMin: 0.9, yMax: 1.6 },
        { x: 'B', y: 0.8, yMin: 0.5, yMax: 1.1 },
        { x: 'C', y: 1.5, yMin: 1.1, yMax: 2 },
        { x: 'D', y: 1.1, yMin: 0.7, yMax: 1.5 },
      ],
    } as unknown as MaidrLayer;

    expect(announce(at(layer, 1, 0))).toBe('Position is column 1 of 4, row 2 of 3');
  });

  test('of dumbbells is at a category of the categories and an end of the pair', () => {
    // "row 3 of 2" before, on Malta's 1990 end: the category read as the row.
    const layer = {
      id: 'dumbbell',
      type: TraceType.DUMBBELL,
      orientation: Orientation.HORIZONTAL,
      data: {
        startLabel: '1990',
        endLabel: '2020',
        points: [
          { x: 'Denmark', start: 71.2, end: 78.4 },
          { x: 'Latvia', start: 74.6, end: 69.5 },
          { x: 'Malta', start: 76.0, end: 76.0 },
        ],
      },
    } as unknown as MaidrLayer;

    expect(announce(at(layer, 0, 2))).toBe('Position is column 3 of 3, row 1 of 2');
    expect(announce(at(layer, 1, 0))).toBe('Position is column 1 of 3, row 2 of 2');
  });
});

describe('a sequence diagram', () => {
  test('is at a message of the messages, not at the lane it arrives at', () => {
    const layer = {
      id: 'sequence',
      type: TraceType.SEQUENCE,
      data: {
        participants: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
        messages: [
          { from: 'A', to: 'B', text: 'one' },
          { from: 'B', to: 'C', text: 'two' },
          { from: 'B', to: 'A', text: 'three' },
        ],
      },
    } as unknown as MaidrLayer;

    expect(announce(at(layer, 0, 2))).toBe('Position is column 3 of 3, row 1 of 4');
  });
});

describe('a ROC curve', () => {
  test('is at a point of its points, not at the fraction of the x axis', () => {
    const layer = {
      id: 'roc',
      type: TraceType.ROC,
      axes: { x: { label: 'False positive rate' }, y: { label: 'True positive rate' } },
      data: [
        [{ x: 0, y: 0, fill: 'A' }, { x: 0.3, y: 0.6, fill: 'A' }, { x: 1, y: 1, fill: 'A' }],
        [{ x: 0, y: 0, fill: 'B' }, { x: 0.2, y: 0.8, fill: 'B' }, { x: 1, y: 1, fill: 'B' }],
      ],
    } as unknown as MaidrLayer;

    expect(announce(at(layer, 1, 1))).toMatch(/^Curve 2 of 2, .*Position is 2 of 3$/);
  });
});

describe('a rug', () => {
  /**
   * Four observations listed out of order on an axis from 0 to 10. They are
   * walked ascending -- 1.2, 1.5, 2.2, 9.4 -- and two of them share the first
   * 2.5-second bin of the braille strip with a third.
   */
  const LATENCY = {
    id: 'rug',
    type: TraceType.RUG,
    axes: { x: { label: 'Seconds', min: 0, max: 10, tickStep: 2.5 } },
    data: [{ x: 2.2 }, { x: 1.5 }, { x: 9.4 }, { x: 1.2 }],
  } as unknown as MaidrLayer;

  test('is at an observation of its observations, not at the fraction of the axis', () => {
    // "Position is 1.12 of 2" before: the pan's 1.2 / 10 of the way along.
    expect(announce(at(LATENCY, 0, 0))).toBe('Position is 1 of 4');
    // The second and third share a braille cell; the position does not.
    expect(announce(at(LATENCY, 0, 2))).toBe('Position is 3 of 4');
    expect(announce(at(LATENCY, 0, 3))).toBe('Position is 4 of 4');
    expect(announce(at(LATENCY, 0, 1), 'terse')).toBe('33%');
  });
});

describe('a sankey', () => {
  /**
   * Mermaid's example: three sources, a node they feed, and three sinks.
   * MAIDR stages it as Solar, Wind and Gas; Electricity and Heating; Homes
   * and Industry -- columns of three, two and two.
   */
  const ENERGY = {
    id: 'sankey',
    type: TraceType.SANKEY,
    data: [
      { source: 'Solar', target: 'Electricity', value: 40 },
      { source: 'Wind', target: 'Electricity', value: 35 },
      { source: 'Gas', target: 'Electricity', value: 60 },
      { source: 'Gas', target: 'Heating', value: 45 },
      { source: 'Electricity', target: 'Homes', value: 70 },
      { source: 'Electricity', target: 'Industry', value: 65 },
    ],
  } as unknown as MaidrLayer;

  test('is at a node of the column the arrows walk, not of the tallest column', () => {
    // The cursor is addressed `[index within the stage][stage]`. Read from the
    // pan, every column was as tall as the tallest: Industry, the last of two,
    // was "row 2 of 3" and Down from it said there was nothing more.
    expect(announce(at(ENERGY, 0, 1))).toBe('Position is column 2 of 3, row 1 of 2');
    expect(announce(at(ENERGY, 1, 2))).toBe('Position is column 3 of 3, row 2 of 2');
    expect(announce(at(ENERGY, 2, 0))).toBe('Position is column 1 of 3, row 3 of 3');
    expect(announce(at(ENERGY, 1, 2), 'terse')).toBe('100%, 100%');
  });

  test('alone in its column is still at a column and a row', () => {
    // A single source, alone in the first column, and the node it feeds,
    // alone in the second. Counted against their own columns they had no
    // row to name, and said "Position is 1 of 3" and "Position is 2 of 3"
    // while the two nodes of the last column said column and row.
    const layer = {
      id: 'sankey',
      type: TraceType.SANKEY,
      data: [
        { source: 'A', target: 'B', value: 5 },
        { source: 'B', target: 'C', value: 3 },
        { source: 'B', target: 'D', value: 2 },
      ],
    } as unknown as MaidrLayer;

    expect(announce(at(layer, 0, 0))).toBe('Position is column 1 of 3, row 1 of 1');
    expect(announce(at(layer, 0, 1))).toBe('Position is column 2 of 3, row 1 of 1');
    expect(announce(at(layer, 0, 1), 'terse')).toBe('50%, 0%');
    expect(announce(at(layer, 1, 2))).toBe('Position is column 3 of 3, row 2 of 2');
  });

  test('of a chain, one node to a column, is a place along it', () => {
    const layer = {
      id: 'sankey',
      type: TraceType.SANKEY,
      data: [
        { source: 'A', target: 'B', value: 5 },
        { source: 'B', target: 'C', value: 5 },
      ],
    } as unknown as MaidrLayer;

    expect(announce(at(layer, 0, 1))).toBe('Position is 2 of 3');
  });

  test('of one stage, a cycle, is in its one column', () => {
    // A chord diagram, or any flow that cycles, is one stage holding every
    // node; the pan spreads it over two columns so it is not dead centre.
    const layer = {
      id: 'chord',
      type: TraceType.CHORD,
      data: [
        { source: 'A', target: 'B', value: 3 },
        { source: 'B', target: 'C', value: 2 },
        { source: 'C', target: 'A', value: 1 },
      ],
    } as unknown as MaidrLayer;

    expect(announce(at(layer, 1, 0))).toBe('Position is column 1 of 1, row 2 of 3');
  });
});

describe('a tree', () => {
  const BOARD = {
    id: 'board',
    type: TraceType.TREE,
    axes: { x: { label: 'Card' } },
    data: [
      { x: 'To do' },
      { x: 'a', path: ['To do'] },
      { x: 'b', path: ['To do'] },
      { x: 'Doing' },
      { x: 'c', path: ['Doing'] },
    ],
  } as unknown as MaidrLayer;

  test('is at a place among the siblings the arrows walk, at its level', () => {
    // "column 3 of 3, row 2 of 2" before: c is the third card of the depth,
    // and the only one in Doing.
    expect(announce(at(BOARD, 1, 2))).toBe('Level 2 of 2, Position is 1 of 1 in Doing');
    expect(announce(at(BOARD, 0, 1))).toBe('Level 1 of 2, Position is 2 of 2');
    expect(announce(at(BOARD, 1, 2), 'terse')).toBe('0%, 100%');
  });

  test('of one level has no level to name', () => {
    const flat = { ...BOARD, data: [{ x: 'a' }, { x: 'b' }, { x: 'c' }] } as unknown as MaidrLayer;

    expect(announce(at(flat, 0, 1))).toBe('Position is 2 of 3');
    expect(announce(at(flat, 0, 1), 'terse')).toBe('50%');
  });

  test('drawn as a sunburst is at its place among its siblings, not round the dial', () => {
    const sunburst = { ...BOARD, type: TraceType.SUNBURST, data: [
      { x: 'To do', y: 2 },
      { x: 'a', y: 1, path: ['To do'] },
      { x: 'b', y: 1, path: ['To do'] },
      { x: 'Doing', y: 1 },
      { x: 'c', y: 1, path: ['Doing'] },
    ] } as unknown as MaidrLayer;

    expect(announce(at(sunburst, 1, 1))).toBe('Level 2 of 2, Position is 2 of 2 in To do');
  });
});
