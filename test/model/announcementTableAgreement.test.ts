import type { AbstractTrace } from '@model/abstract';
import type { MaidrLayer } from '@type/grammar';
import type { DescriptionState, NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

/**
 * One dialog, one value, one reading.
 *
 * A layer may declare a `format` per axis, and two surfaces of the `d` dialog
 * are supposed to honour it: the announcement, which routes `main` through
 * `mainAxis` and `cross`/`stack` through `crossAxis`, and the data table,
 * which routes each column through the axis named in `columnAxes`. When the
 * two name different axes for the same quantity, one dialog describes one
 * value two ways and says nothing about which is meant.
 *
 * Each case below is a disagreement that shipped. They are pinned per trace
 * rather than checked generically because matching a column to the
 * announcement field carrying the same quantity is exactly the judgement a
 * generic test cannot make.
 */

/**
 * Builds a trace and reads its description.
 *
 * @param layer - The layer to build from
 * @returns The description the trace produces
 */
function describedBy(layer: MaidrLayer): DescriptionState {
  return (TraceFactory.create(layer) as AbstractTrace).description;
}

/**
 * The axis named for the column under a given header.
 *
 * By header rather than by index so a case says which column it means, and so
 * an inserted column fails the lookup rather than silently moving the
 * assertion onto its neighbour.
 *
 * @param description - The description to read
 * @param header - The column's header
 * @returns The axis that column declares, or undefined
 */
function axisOf(description: DescriptionState, header: string): string | undefined {
  const index = description.dataTable.headers.indexOf(header);
  if (index < 0) {
    throw new Error(
      `No column headed "${header}"; got ${JSON.stringify(description.dataTable.headers)}`,
    );
  }
  return description.dataTable.columnAxes?.[index];
}

/**
 * Reads a trace's state, refusing an empty one.
 *
 * @param trace - The trace to read
 * @returns Its non-empty state
 */
function nonEmptyState(trace: AbstractTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

describe('scatter announces the axis it is actually reading', () => {
  const layer: MaidrLayer = {
    id: 'scatter',
    type: TraceType.SCATTER,
    title: 'Prices over time',
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data: [
      { x: 1, y: 10 },
      { x: 2, y: 20 },
      { x: 3, y: 30 },
    ],
  };

  test('column navigation reads along an x, so main is the x', () => {
    const state = nonEmptyState(TraceFactory.create(layer) as AbstractTrace);

    expect(state.text.main.label).toBe('Date');
    expect(state.text.mainAxis).toBe('x');
    expect(state.text.crossAxis).toBe('y');
  });

  test('row navigation reads along a y, so main is the y', () => {
    const trace = TraceFactory.create(layer) as AbstractTrace;
    // The first move is the initial-entry handshake; the second toggles to
    // ROW mode. One arrow key from the default, not a corner.
    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');
    const state = nonEmptyState(trace);

    // The regression: neither axis was declared, so `TextService` fell back to
    // main = x and cross = y. In this mode main holds the *y* reading and
    // cross the *x* ones, so a layer formatting its date x and currency y
    // announced each through the other's formatter.
    expect(state.text.main.label).toBe('Price');
    expect(state.text.mainAxis).toBe('y');
    expect(state.text.cross?.label).toBe('Date');
    expect(state.text.crossAxis).toBe('x');
  });

  test('the table names the same axes the announcement does', () => {
    const description = describedBy(layer);

    expect(axisOf(description, 'Date')).toBe('x');
    expect(axisOf(description, 'Price')).toBe('y');
  });
});

describe('ridgeline reads its density off z, on both surfaces', () => {
  const layer: MaidrLayer = {
    id: 'ridgeline',
    type: TraceType.RIDGELINE,
    title: 'Distributions by cohort',
    axes: { x: { label: 'Score' }, y: { label: 'Cohort' }, z: { label: 'Density' } },
    data: [
      [
        { x: '2019', y: 10, density: 0.25 },
        { x: '2019', y: 20, density: 0.5 },
      ],
      [
        { x: '2020', y: 10, density: 0.125 },
        { x: '2020', y: 20, density: 0.75 },
      ],
    ],
  };

  test('announces the curve height through z, not through the group axis', () => {
    const state = nonEmptyState(TraceFactory.create(layer) as AbstractTrace);

    // A ridgeline stacks its groups down y. Left to the default, the density
    // went through the *y* formatter -- so a layer that formatted its cohort
    // codes announced a KDE value as a cohort.
    expect(state.text.cross?.label).toBe('Density');
    expect(state.text.crossAxis).toBe('z');
    expect(state.text.mainAxis).toBe('x');
  });

  test('the density column names z, matching what was just spoken', () => {
    expect(axisOf(describedBy(layer), 'Density')).toBe('z');
  });

  test('the group column names no axis, because the announcement speaks it verbatim', () => {
    // The group reaches the reader through `section`, which `TextService`
    // pushes untouched precisely to keep an authored group name intact.
    // Naming y here would format it on the one surface meant to agree.
    expect(axisOf(describedBy(layer), 'Cohort')).toBeUndefined();
  });
});

describe('a value the announcement formats, the table formats too', () => {
  test("a stacked area's total sits on the value axis", () => {
    const description = describedBy({
      id: 'area',
      type: TraceType.STACKED_AREA,
      title: 'Revenue by region',
      axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
      data: [
        [{ x: 'Q1', y: 3, fill: 'North' }, { x: 'Q2', y: 4, fill: 'North' }],
        [{ x: 'Q1', y: 5, fill: 'South' }, { x: 'Q2', y: 6, fill: 'South' }],
      ],
    });

    // A sum of band heights carries their units and is drawn at the top of
    // the stack; `text` already announces it as `stack`, through y.
    expect(axisOf(description, 'Total')).toBe('y');
  });

  test("a dumbbell's change sits on the value axis, in both orientations", () => {
    const data = {
      startLabel: '1990',
      endLabel: '2020',
      points: [{ x: 'Denmark', start: 71.2, end: 78.4 }],
    };
    const build = (orientation?: Orientation): MaidrLayer => ({
      id: 'dumbbell',
      type: TraceType.DUMBBELL,
      title: 'Life expectancy',
      axes: { x: { label: 'Country' }, y: { label: 'Years' } },
      orientation,
      data,
    });

    // A difference of two readings on an axis carries that axis's units, and
    // the announcement speaks it through that formatter as `stack`.
    expect(axisOf(describedBy(build()), 'Change')).toBe('y');
    expect(axisOf(describedBy(build(Orientation.HORIZONTAL)), 'Change')).toBe('x');
  });
});
