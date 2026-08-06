import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { DescriptionState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { BoxTrace } from '@model/box';
import { DescriptionService } from '@service/description';
import { TraceType } from '@type/grammar';

/**
 * Wraps a trace as the active element of a mock Context, exposing only the
 * surface `DescriptionService` touches on the trace-level branch. The trace is
 * a real `BoxTrace` so the rounding is exercised against a description a trace
 * actually produces, not a hand-written one.
 */
function createMockContext(active: unknown): Context {
  return {
    active,
    figureTitle: 'unavailable',
    isAuthoredTitle: () => false,
    isAuthoredSubtitle: () => false,
    isAuthoredCaption: () => false,
    isAuthoredAxisLabel: (value: string) => value.trim() !== '',
    getSubplotSummaries: () => [],
  } as unknown as Context;
}

function createMockDisplayService(): DisplayService {
  return { toggleFocus: jest.fn() } as unknown as DisplayService;
}

/**
 * Builds a single-group box trace with the given values, no selectors, so the
 * trace needs no DOM.
 */
function boxTrace(
  values: { min: number; q1: number; q2: number; q3: number; max: number },
  outliers: { lower?: number[]; upper?: number[] } = {},
): BoxTrace {
  return new BoxTrace({
    id: 'box',
    type: TraceType.BOX,
    title: 'Boxes',
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    data: [{
      z: 'A',
      lowerOutliers: outliers.lower ?? [],
      upperOutliers: outliers.upper ?? [],
      ...values,
    }],
  });
}

/**
 * Runs a trace's description through the service and returns it.
 */
function describeTrace(trace: BoxTrace): DescriptionState {
  const service = new DescriptionService(
    createMockContext(trace),
    createMockDisplayService(),
  );
  const description = service.getDescription();
  expect(description).not.toBeNull();
  return description as DescriptionState;
}

/**
 * Reads a row of the data table by its group name.
 */
function row(description: DescriptionState, group: string): unknown[] {
  return description.dataTable.rows.find(r => r[0] === group) as unknown[];
}

describe('descriptionService value rounding', () => {
  test('rounds a computed float down to what a screen reader can speak', () => {
    // The vertical box plot example really does report this whisker.
    const description = describeTrace(boxTrace({
      min: 21.957700280519678,
      q1: 66.08295590961171,
      q2: 81.78930318003049,
      q3: 99.3836370729716,
      max: 148.94899365313984,
    }));

    expect(row(description, 'A')).toEqual([
      'A',
      '',
      '21.96',
      '66.08',
      '81.79',
      '99.38',
      '148.95',
      '',
    ]);
  });

  test('rounds each outlier before joining them into one cell', () => {
    const description = describeTrace(
      boxTrace(
        { min: 21.957700280519678, q1: 66, q2: 81, q3: 99, max: 148 },
        { lower: [-9.795014876280863, 6.057387303065189], upper: [156.3770136893095] },
      ),
    );

    // Traces hand outliers over unjoined precisely so each one gets rounded;
    // a pre-joined string would have arrived here as opaque text.
    const cells = row(description, 'A');
    expect(cells[1]).toBe('-9.8, 6.06');
    expect(cells[7]).toBe('156.38');
  });

  test('leaves an integer alone rather than padding it with decimals', () => {
    const description = describeTrace(boxTrace({
      min: 5,
      q1: 10,
      q2: 15,
      q3: 20,
      max: 25,
    }));

    expect(row(description, 'A')).toEqual(['A', '', '5', '10', '15', '20', '25', '']);
  });

  test('keeps a non-finite value a number so the dialog still blanks it', () => {
    const description = describeTrace(boxTrace({
      min: Number.NaN,
      q1: 10,
      q2: 15,
      q3: 20,
      max: 25,
    }));

    // `defaultFormat` would hand back the literal text "NaN", which the
    // dialog's isDisplayable check blanks as a number but would print as a
    // string.
    const cells = row(description, 'A');
    expect(cells[2]).toBeNaN();
    expect(typeof cells[2]).toBe('number');
  });

  test('rounds the summary rows too, group name intact', () => {
    const trace = new BoxTrace({
      id: 'box',
      type: TraceType.BOX,
      title: 'Boxes',
      axes: { x: { label: 'Group' }, y: { label: 'Value' } },
      data: [
        { z: 'A', lowerOutliers: [], min: 21.957700280519678, q1: 66, q2: 81, q3: 99, max: 148.94899365313984, upperOutliers: [] },
        { z: 'B', lowerOutliers: [], min: 34.19825007539889, q1: 74, q2: 89, q3: 102, max: 137.4429364944776, upperOutliers: [] },
      ],
    });
    const description = describeTrace(trace);
    const stat = (label: string): unknown =>
      description.stats.find(s => s.label === label)?.value;

    expect(stat('Lowest minimum')).toBe('21.96 (A)');
    expect(stat('Highest maximum')).toBe('148.95 (A)');
  });

  test('leaves a label string untouched', () => {
    const description = describeTrace(boxTrace({
      min: 5,
      q1: 10,
      q2: 15,
      q3: 20,
      max: 25,
    }));
    const stat = (label: string): unknown =>
      description.stats.find(s => s.label === label)?.value;

    expect(stat('Group names')).toBe('A');
    expect(description.dataTable.headers).toContain('Lower outlier(s)');
  });
});
