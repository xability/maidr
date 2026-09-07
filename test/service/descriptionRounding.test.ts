import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { RotorNavigationService } from '@service/rotor';
import type { AxisFormat, Maidr } from '@type/grammar';
import type { DescriptionState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { BoxTrace } from '@model/box';
import { DescriptionService } from '@service/description';
import { FormatterService } from '@service/formatter';
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
    getLayerSummaries: () => [],
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
 * A `FormatterService` over one layer whose axes carry the given formats, keyed
 * by the id `boxTrace` gives its layer. Real rather than mocked: the point of
 * the table's formatting is that it says the same thing the announcements do,
 * and only the service that produces those can prove it.
 */
function formatterFor(formats: { x?: AxisFormat; y?: AxisFormat } = {}): FormatterService {
  const maidr: Maidr = {
    id: 'chart',
    subplots: [[{
      layers: [{
        id: 'box',
        type: TraceType.BOX,
        axes: {
          x: { label: 'Group', ...(formats.x ? { format: formats.x } : {}) },
          y: { label: 'Value', ...(formats.y ? { format: formats.y } : {}) },
        },
        data: [],
      }],
    }]],
  };
  return new FormatterService(maidr);
}

/**
 * Runs a trace's description through the service and returns it.
 */
function describeTrace(
  trace: BoxTrace,
  formatter: FormatterService = formatterFor(),
): DescriptionState {
  const service = new DescriptionService(
    createMockContext(trace),
    createMockDisplayService(),
    { resetToDataMode: jest.fn() } as unknown as RotorNavigationService,
    formatter,
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

  test('names a non-finite outlier rather than dropping it from the joined cell', () => {
    const description = describeTrace(
      boxTrace(
        { min: 5, q1: 10, q2: 15, q3: 20, max: 25 },
        { lower: [-2.5551, Number.NaN, -1], upper: [Number.NaN] },
      ),
    );

    // `join` coerces a non-finite number back into the text "NaN", and a
    // joined cell cannot hand a blank back for one entry — but dropping the
    // entry made the cell claim two outliers where the trace reported three,
    // with nothing to say one had gone. `missing` is the word the
    // announcements already use for a value that is not there.
    const cells = row(description, 'A');
    expect(cells[1]).toBe('-2.56, missing, -1');
    expect(cells[7]).toBe('missing');
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

describe('descriptionService authored axis formats', () => {
  test('reads a formatted column the way the layer\'s author asked for it', () => {
    // The vertical box plot example formats its value axis to two decimals.
    // Navigation already announced "71.35"; the table printed the raw float
    // beside it, so one dialog described one value two ways.
    const description = describeTrace(
      boxTrace({ min: 8.75067648450717, q1: 61.3, q2: 78.9, q3: 96.4, max: 129.24 }),
      formatterFor({ y: { type: 'fixed', decimals: 4 } }),
    );

    // 8.75 is what this service's own rounding would have said.
    expect(row(description, 'A')[2]).toBe('8.7507');
  });

  test('formats every outlier in a joined cell, not just the first', () => {
    const description = describeTrace(
      boxTrace(
        { min: 5, q1: 10, q2: 15, q3: 20, max: 25 },
        { lower: [-9.795014876280863, 6.057387303065189] },
      ),
      formatterFor({ y: { type: 'currency', decimals: 2 } }),
    );

    expect(row(description, 'A')[1]).toBe('-$9.80, $6.06');
  });

  test('formats the group column through the categorical axis, as bar charts do', () => {
    // The bar example maps abbreviated day names to full ones with an x
    // format function; a vertical box plot's groups sit on the same axis.
    const description = describeTrace(
      boxTrace({ min: 5, q1: 10, q2: 15, q3: 20, max: 25 }),
      formatterFor({ x: { function: 'return "Group " + value' } }),
    );

    expect(description.dataTable.rows[0][0]).toBe('Group A');
  });

  test('leaves an empty cell empty rather than letting a format invent a value', () => {
    const description = describeTrace(
      boxTrace({ min: 5, q1: 10, q2: 15, q3: 20, max: 25 }),
      // The shape a chart's own format function takes: `Number('')` is 0, so
      // this would read a blank outlier cell as "0.0" if it ever saw one.
      formatterFor({ y: { function: 'return Number(value).toFixed(1)' } }),
    );

    // Columns 1 and 7 are the outlier cells, and this box has no outliers.
    const cells = row(description, 'A');
    expect(cells[1]).toBe('');
    expect(cells[7]).toBe('');
    expect(cells[2]).toBe('5.0');
  });

  test('still hands a non-finite cell back as a number for the dialog to blank', () => {
    const description = describeTrace(
      boxTrace({ min: Number.NaN, q1: 10, q2: 15, q3: 20, max: 25 }),
      formatterFor({ y: { type: 'currency', decimals: 2 } }),
    );

    // A formatter would name it `missing`, which the dialog prints; as a
    // number it is blanked, exactly as an unformatted column's NaN is.
    const cells = row(description, 'A');
    expect(cells[2]).toBeNaN();
    expect(typeof cells[2]).toBe('number');
  });

  test('leaves an unformatted layer reading exactly as it did before', () => {
    // Every axis has a formatter, because one with no `format` falls back to
    // the default. Using it anyway would print `missing` in every empty cell
    // of this sparse table, where the dialog renders a blank today.
    const description = describeTrace(boxTrace({ min: 5, q1: 10, q2: 15, q3: 20, max: 25 }));

    expect(row(description, 'A')).toEqual(['A', '', '5', '10', '15', '20', '25', '']);
  });

  test('formats only the axis the author declared, leaving the other rounded', () => {
    const description = describeTrace(
      boxTrace({ min: 8.75067648450717, q1: 61.3, q2: 78.9, q3: 96.4, max: 129.24 }),
      formatterFor({ y: { type: 'fixed', decimals: 4 } }),
    );

    // The group name sits on x, which carries no format: still the raw label,
    // not the default formatter's rendering of it.
    expect(description.dataTable.rows[0][0]).toBe('A');
  });
});
