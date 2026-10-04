/**
 * @jest-environment jsdom
 */

import type { MaidrLayer, PercentileBandPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { afterEach, describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { PercentileBandTrace } from '@model/percentileBand';
import { TraceType } from '@type/grammar';

/** TensorBoard's nine basis points: the median and one, two and three sigma either side. */
const LEVELS = [0, 0.0668, 0.1587, 0.3085, 0.5, 0.6915, 0.8413, 0.9332, 1];

/**
 * One step of the distribution.
 * @param x - The step
 * @param values - The value at each of {@link LEVELS}, lowest first
 * @returns The point
 */
function step(x: number, values: (number | null)[]): PercentileBandPoint {
  return { x, quantiles: values.map((value, i) => ({ level: LEVELS[i], value })) };
}

/**
 * Four training steps. The middle 68% (15.87th to 84.13th percentile) is 0.8
 * wide at step 0, 0.66 at 100, 1.7 at 200 and 0.5 at 300: it widens most
 * from 100 to 200, by 1.04, and narrows most from 200 to 300, by 1.2.
 */
const STEPS: PercentileBandPoint[] = [
  step(0, [-1, -0.7, -0.4, -0.15, 0, 0.15, 0.4, 0.7, 1]),
  step(100, [-0.92, -0.61, -0.31, -0.12, 0.02, 0.16, 0.35, 0.64, 0.97]),
  step(200, [-1.5, -1.1, -0.8, -0.3, 0.05, 0.4, 0.9, 1.2, 1.6]),
  step(300, [-0.6, -0.4, -0.2, -0.05, 0.06, 0.15, 0.3, 0.5, 0.7]),
];

/**
 * Create a percentile band layer.
 * @param data - The band's points
 * @param overrides - Fields to change on the layer
 * @returns The layer definition
 */
function createLayer(
  data: PercentileBandPoint[] = STEPS,
  overrides: Partial<MaidrLayer> = {},
): MaidrLayer {
  return {
    id: 'band',
    type: TraceType.PERCENTILE_BAND,
    title: 'Dense layer weights',
    axes: { x: { label: 'Step' }, y: { label: 'Weight' } },
    data,
    ...overrides,
  };
}

/**
 * Build a band and enter it, which puts the cursor on the median of the first step.
 * @param data - The band's points
 * @param overrides - Fields to change on the layer
 * @returns The entered trace
 */
function band(data: PercentileBandPoint[] = STEPS, overrides: Partial<MaidrLayer> = {}): PercentileBandTrace {
  const trace = TraceFactory.create(createLayer(data, overrides)) as PercentileBandTrace;
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace - The trace to read
 * @returns The non-empty trace state
 */
function stateOf(trace: PercentileBandTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * The value of one description stat, by label.
 * @param trace - The trace to describe
 * @param label - The stat's label
 * @returns Its value, or undefined when the description has no such stat
 */
function stat(trace: PercentileBandTrace, label: string): string | number | undefined {
  return trace.description.stats.find(entry => entry.label === label)?.value;
}

describe('percentile band registration', () => {
  test('the factory builds a PercentileBandTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(PercentileBandTrace);
  });

  test('announces itself as the chart it is, not as a multiline', () => {
    const trace = band();

    expect(trace.description.chartType).toBe('Percentile Band');
    expect(stateOf(trace).plotType).toBe('percentile band');
  });

  test('an empty layer answers with the empty state rather than throwing', () => {
    const trace = TraceFactory.create(createLayer([])) as PercentileBandTrace;

    expect(trace.state.empty).toBe(true);
    expect(trace.description.stats).toEqual(expect.arrayContaining([
      { label: 'Number of quantiles', value: 0 },
    ]));
  });

  test('a payload that is not a list of points is an empty band', () => {
    const trace = TraceFactory.create(
      createLayer({} as unknown as PercentileBandPoint[]),
    ) as PercentileBandTrace;

    expect(trace.state.empty).toBe(true);
  });
});

describe('navigation', () => {
  test('enters on the median of the first x', () => {
    const state = stateOf(band());

    expect(state.text.main).toEqual({ label: 'Step', value: 0 });
    expect(state.text.section).toBe('Median');
    expect(state.text.cross).toEqual({ label: 'Weight', value: 0 });
  });

  test('left and right walk the median along x', () => {
    const trace = band();

    trace.moveOnce('FORWARD');

    const state = stateOf(trace);
    expect(state.text.main.value).toBe(100);
    expect(state.text.section).toBe('Median');
    expect(state.text.cross?.value).toBe(0.02);
  });

  test('up and down step through the quantiles in order at the same x', () => {
    const trace = band();
    trace.moveOnce('FORWARD');

    trace.moveOnce('UPWARD');
    expect(stateOf(trace).text.section).toBe('69.2th percentile');
    trace.moveOnce('UPWARD');
    expect(stateOf(trace).text.section).toBe('84.1th percentile');
    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');
    expect(stateOf(trace).text.section).toBe('Maximum');
    expect(stateOf(trace).text.cross?.value).toBe(0.97);
    expect(stateOf(trace).text.main.value).toBe(100);
  });

  test('a bound is walked along x once the reader is on it', () => {
    const trace = band();
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('DOWNWARD');

    trace.moveOnce('FORWARD');

    expect(stateOf(trace).text.section).toBe('15.9th percentile');
    expect(stateOf(trace).text.cross?.value).toBe(-0.31);
  });

  test('stops at the outermost bounds', () => {
    const trace = band();
    for (let i = 0; i < 4; i++) {
      trace.moveOnce('UPWARD');
    }

    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(false);
    expect(stateOf(trace).text.section).toBe('Maximum');
  });

  test('steps over a quantile with no reading at this x', () => {
    const gappy = [step(0, [-1, -0.7, null, -0.15, 0, 0.15, 0.4, 0.7, 1])];
    const trace = band(gappy);
    trace.moveOnce('DOWNWARD');

    trace.moveOnce('DOWNWARD');

    expect(stateOf(trace).text.section).toBe('6.68th percentile');
  });

  test('offers no crossings: nested quantiles never cross', () => {
    const trace = band();

    expect(trace.supportsIntersectionMode()).toBe(false);
    expect(trace.getExtremaTargets().some(target => target.type === 'intersection')).toBe(false);
  });

  test('enters on the level nearest the median when there is no 0.5', () => {
    const quartiles: PercentileBandPoint[] = [
      { x: 'Q1', quantiles: [{ level: 0.1, value: 1 }, { level: 0.4, value: 2 }, { level: 0.75, value: 3 }] },
    ];

    expect(stateOf(band(quartiles)).text.section).toBe('40th percentile');
  });
});

describe('announcement', () => {
  test('on the median, says the band nearest one standard deviation either side', () => {
    const trace = band();
    trace.moveOnce('FORWARD');

    expect(stateOf(trace).text.asides).toEqual([
      { label: 'Middle 68%', value: '-0.31 to 0.35' },
    ]);
  });

  test('on a bound, says the median and the band that bound belongs to', () => {
    const trace = band();
    trace.moveOnce('FORWARD');
    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');

    expect(stateOf(trace).text.asides).toEqual([
      { label: 'Median', value: '0.02' },
      { label: 'Middle 87%', value: '-0.61 to 0.64' },
    ]);
  });

  test('names the outermost band the full range', () => {
    const trace = band();
    for (let i = 0; i < 4; i++) {
      trace.moveOnce('DOWNWARD');
    }

    expect(stateOf(trace).text.asides).toContainEqual({ label: 'Full range', value: '-1 to 1' });
  });

  test('names an asymmetric band by both of its levels', () => {
    const skewed: PercentileBandPoint[] = [
      { x: 1, quantiles: [{ level: 0.05, value: 1 }, { level: 0.5, value: 2 }, { level: 0.9, value: 4 }] },
    ];
    const trace = band(skewed);

    expect(stateOf(trace).text.asides).toEqual([
      { label: '5th percentile to 90th percentile', value: '1 to 4' },
    ]);
  });

  test('formats the bands with the value axis format', () => {
    const trace = band(STEPS, {
      axes: { x: { label: 'Step' }, y: { label: 'Weight', format: { type: 'fixed', decimals: 3 } } },
    });

    expect(stateOf(trace).text.asides).toEqual([
      { label: 'Middle 68%', value: '-0.400 to 0.400' },
    ]);
  });
});

describe('audio and braille', () => {
  test('every quantile is pitched against the whole band', () => {
    const trace = band();
    const median = stateOf(trace).audio;
    trace.moveOnce('UPWARD');
    const above = stateOf(trace).audio;

    expect(median.freq.min).toBe(-1.5);
    expect(median.freq.max).toBe(1.6);
    expect(above.freq.min).toBe(-1.5);
    expect(above.freq.max).toBe(1.6);
    expect(above.freq.raw).toBeGreaterThan(median.freq.raw as number);
  });

  test('every braille row is encoded against the whole band', () => {
    const braille = stateOf(band()).braille;
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }

    expect(braille.min).toEqual(LEVELS.map(() => -1.5));
    expect(braille.max).toEqual(LEVELS.map(() => 1.6));
    expect(braille.row).toBe(4);
  });
});

describe('description', () => {
  test('lists the quantiles and the median\'s range', () => {
    const trace = band();

    expect(stat(trace, 'Number of quantiles')).toBe(9);
    expect(stat(trace, 'Points along the band')).toBe(4);
    expect(stat(trace, 'Quantile levels')).toBe(
      'Minimum, 6.68th percentile, 15.9th percentile, 30.9th percentile, Median, '
      + '69.2th percentile, 84.1th percentile, 93.3th percentile, Maximum',
    );
    expect(stat(trace, 'Lowest median')).toBe('0 at 0');
    expect(stat(trace, 'Highest median')).toBe('0.06 at 300');
    expect(stat(trace, 'Total points')).toBeUndefined();
  });

  test('says where the spread is widest and narrowest', () => {
    const trace = band();

    expect(stat(trace, 'Middle 68% at its widest')).toBe('1.7 at 200');
    expect(stat(trace, 'Middle 68% at its narrowest')).toBe('0.5 at 300');
  });

  test('says where the spread widens and narrows most', () => {
    const trace = band();

    expect(stat(trace, 'Middle 68% widens most')).toBe('from 100 to 200, by 1.04');
    expect(stat(trace, 'Middle 68% narrows most')).toBe('from 200 to 300, by 1.2');
  });

  test('says nothing about narrowing on a band that only widens', () => {
    const trace = band(STEPS.slice(1, 3));

    expect(stat(trace, 'Middle 68% widens most')).toBe('from 100 to 200, by 1.04');
    expect(stat(trace, 'Middle 68% narrows most')).toBeUndefined();
  });

  test('does not read a gap as the band collapsing', () => {
    const gappy = [STEPS[0], step(100, [-0.92, -0.61, null, -0.12, 0.02, 0.16, 0.35, 0.64, 0.97]), STEPS[2]];
    const trace = band(gappy);

    expect(stat(trace, 'Middle 68% narrows most')).toBeUndefined();
    expect(stat(trace, 'Middle 68% widens most')).toBeUndefined();
    expect(stat(trace, 'Middle 68% at its narrowest')).toBe('0.8 at 0');
  });

  test('tables one row per x and one column per quantile', () => {
    const table = band().description.dataTable;

    expect(table.headers).toEqual([
      'Step',
      'Minimum',
      '6.68th percentile',
      '15.9th percentile',
      '30.9th percentile',
      'Median',
      '69.2th percentile',
      '84.1th percentile',
      '93.3th percentile',
      'Maximum',
    ]);
    expect(table.columnAxes).toEqual(['x', ...LEVELS.map(() => 'y')]);
    expect(table.rows).toHaveLength(4);
    expect(table.rows[1]).toEqual([100, -0.92, -0.61, -0.31, -0.12, 0.02, 0.16, 0.35, 0.64, 0.97]);
  });
});

describe('highlight', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  /**
   * Draw four nested band polygons and a median line, the way a fan chart is drawn.
   * @returns The band polygons, outermost first, and the median line
   */
  function drawBands(): { polygons: Element[]; median: Element } {
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <g id="bands">
          <polygon points="0,0 10,0 10,10 0,10" />
          <polygon points="1,1 9,1 9,9 1,9" />
          <polygon points="2,2 8,2 8,8 2,8" />
          <polygon points="3,3 7,3 7,7 3,7" />
        </g>
        <polyline id="median" points="0,5 3,5 6,5 9,5" />
      </svg>`;
    return {
      polygons: [...document.querySelectorAll('#bands polygon')],
      median: document.querySelector('#median')!,
    };
  }

  /** One selector per band, outermost first. */
  const BAND_SELECTORS = [1, 2, 3, 4].map(n => `#bands > polygon:nth-of-type(${n})`);

  test('a bound outlines the band it bounds', () => {
    const { polygons } = drawBands();
    const trace = band(STEPS, { selectors: BAND_SELECTORS });
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('DOWNWARD');

    const highlight = stateOf(trace).highlight;

    expect(highlight.empty).toBe(false);
    expect(highlight.empty ? [] : highlight.elements).toEqual([polygons[2]]);
  });

  test('the median outlines its own line when one is named', () => {
    const { median } = drawBands();
    const trace = band(STEPS, { selectors: [...BAND_SELECTORS, '#median'] });

    const highlight = stateOf(trace).highlight;

    expect(highlight.empty ? [] : highlight.elements).toEqual([median]);
  });

  test('the median outlines the innermost band when no line is named', () => {
    const { polygons } = drawBands();
    const trace = band(STEPS, { selectors: BAND_SELECTORS });

    const highlight = stateOf(trace).highlight;

    expect(highlight.empty ? [] : highlight.elements).toEqual([polygons[3]]);
  });

  test('reads without an outline when the selectors match nothing', () => {
    drawBands();
    const trace = band(STEPS, { selectors: ['#nothing-1', '#nothing-2', '#nothing-3', '#nothing-4'] });

    const state = stateOf(trace);

    expect(state.highlight.empty).toBe(true);
    expect(state.text.section).toBe('Median');
  });

  test('reads without an outline when the layer names no selectors', () => {
    const state = stateOf(band());

    expect(state.highlight.empty).toBe(true);
  });
});
