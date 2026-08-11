import type { GaugePoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { GaugeTrace } from '@model/gauge';
import { TraceType } from '@type/grammar';

/**
 * A bullet chart short of its target, landing in the middle band. Every number
 * is distinct so a reading that took the wrong field cannot coincide with the
 * right one.
 */
const KPI: GaugePoint = {
  label: 'Conversion',
  value: 73,
  min: 0,
  max: 100,
  target: 80,
  bands: [
    { to: 50, label: 'poor' },
    { to: 75, label: 'ok' },
    { to: 100, label: 'good' },
  ],
};

/**
 * Create a minimal gauge layer for model-only tests.
 * @param data The measure the layer carries
 * @returns Gauge layer definition
 */
function createLayer(data: GaugePoint): MaidrLayer {
  return {
    id: 'test-gauge-layer',
    type: TraceType.GAUGE,
    title: 'Conversion rate',
    axes: { x: { label: 'Measure' }, y: { label: 'Percent' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: GaugeTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a gauge trace positioned on its single point.
 * @param data The measure the layer carries
 * @returns The positioned trace
 */
function gauge(data: GaugePoint = KPI): GaugeTrace {
  const trace = TraceFactory.create(createLayer(data)) as GaugeTrace;
  trace.moveToIndex(0, 0);
  return trace;
}

describe('gauge registration', () => {
  test('the factory builds a GaugeTrace', () => {
    expect(TraceFactory.create(createLayer(KPI))).toBeInstanceOf(GaugeTrace);
  });

  test('announces itself as a gauge', () => {
    expect(gauge().description.chartType).toBe('Gauge');
  });

  test('is a single cell, with nowhere to move', () => {
    const trace = gauge();

    expect(trace.moveOnce('FORWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(false);
  });
});

describe('the reading is relational', () => {
  test('carries the range the value sits in', () => {
    // The whole reason this is a trace type. "73" alone is unanchored: a
    // sighted reader gets the scale from the dial's geometry, and there is no
    // textual equivalent anywhere on the chart.
    const { text } = nonEmptyState(gauge());

    expect(text.cross.value).toBe(73);
    expect(text.range).toEqual({ min: 0, max: 100 });
  });

  test('carries the target a bullet chart draws', () => {
    const { text } = nonEmptyState(gauge());

    expect(text.stack).toEqual({ label: 'Target', value: 80 });
  });

  test('names the band the value lands in', () => {
    // 73 is past the 'poor' edge at 50 and within the 'ok' edge at 75.
    expect(nonEmptyState(gauge()).text.section).toBe('ok');
  });

  test('names the measure rather than repeating the number', () => {
    expect(nonEmptyState(gauge()).text.main.value).toBe('Conversion');
  });
});

describe('bands', () => {
  test('picks the first band the value has not passed', () => {
    const at50 = { ...KPI, value: 50 };
    const at51 = { ...KPI, value: 51 };

    // The edge is inclusive, so 50 is still 'poor' and 51 has moved on.
    expect(nonEmptyState(gauge(at50)).text.section).toBe('poor');
    expect(nonEmptyState(gauge(at51)).text.section).toBe('ok');
  });

  test('sorts bands before reading them', () => {
    // A chart may author its bands in any order; the classification is a
    // property of the numbers, not of the array.
    const shuffled: GaugePoint = {
      ...KPI,
      bands: [
        { to: 100, label: 'good' },
        { to: 50, label: 'poor' },
        { to: 75, label: 'ok' },
      ],
    };

    expect(nonEmptyState(gauge(shuffled)).text.section).toBe('ok');
  });

  test('claims no band for a value past every declared one', () => {
    // Bands need not reach `max`, so a value beyond them belongs to none.
    // Naming the last one would invent a classification the chart does not
    // draw.
    const sparse: GaugePoint = {
      value: 90,
      min: 0,
      max: 100,
      bands: [{ to: 50, label: 'poor' }],
    };

    expect(nonEmptyState(gauge(sparse)).text.section).toBeUndefined();
  });

  test('says nothing about bands when the chart draws none', () => {
    const plain: GaugePoint = { value: 42, min: 0, max: 50 };

    expect(nonEmptyState(gauge(plain)).text.section).toBeUndefined();
    expect(nonEmptyState(gauge(plain)).text.stack).toBeUndefined();
  });
});

describe('audio', () => {
  test('pitches the value against the dial, not against itself', () => {
    // A lone tone with no range behind it says only that a number exists.
    const { audio } = nonEmptyState(gauge());

    expect(audio.freq.raw).toBe(73);
    expect(audio.freq.min).toBe(0);
    expect(audio.freq.max).toBe(100);
  });
});

describe('braille', () => {
  test('renders one cell scaled against the dial', () => {
    const { braille } = nonEmptyState(gauge());

    expect(braille.empty).toBe(false);
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }
    expect(braille.values).toEqual([[73]]);
    expect(braille.min).toEqual([0]);
    expect(braille.max).toEqual([100]);
  });
});

describe('description', () => {
  test('reports the distance to target by direction', () => {
    // "7 below target" is the question a reader is asking. A bare -7 leaves
    // them working out which way it points.
    const { stats } = gauge().description;

    expect(stats).toContainEqual({ label: 'Below target by', value: 7 });
  });

  test('says above when the measure has passed its target', () => {
    const { stats } = gauge({ ...KPI, value: 88 }).description;

    expect(stats).toContainEqual({ label: 'Above target by', value: 8 });
  });

  test('treats hitting the target exactly as not being below it', () => {
    const { stats } = gauge({ ...KPI, value: 80 }).description;

    expect(stats).toContainEqual({ label: 'Above target by', value: 0 });
  });

  test('reports the range and the band', () => {
    const { stats } = gauge().description;

    expect(stats).toContainEqual({ label: 'Value', value: 73 });
    expect(stats).toContainEqual({ label: 'Range', value: '0 to 100' });
    expect(stats).toContainEqual({ label: 'Band', value: 'ok' });
  });

  test('omits the target stats when the chart draws no target', () => {
    const labels = gauge({ value: 42, min: 0, max: 50 })
      .description
      .stats
      .map(stat => stat.label);

    expect(labels).not.toContain('Target');
    expect(labels).not.toContain('Below target by');
  });
});
