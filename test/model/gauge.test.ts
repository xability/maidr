import type { NotificationService } from '@service/notification';
import type { GaugePoint, MaidrLayer } from '@type/grammar';
import type { DescriptionStat, NonEmptyTraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { GaugeTrace } from '@model/gauge';
import { TextService } from '@service/text';
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

/**
 * Read the sentence a screen reader receives for the trace's current point.
 *
 * The `TextState` a trace returns is an intermediate: which fields it fills
 * decides how `TextService` composes the sentence, and a field in the wrong
 * slot can leave every assertion on the state passing while the announcement
 * says something else. This renders the sentence itself.
 * @param trace The positioned trace
 * @returns The announcement, in the default verbose mode
 */
function announce(trace: GaugeTrace): string {
  const notification = { notify: jest.fn() } as unknown as NotificationService;
  const text = new TextService(notification);
  const listener = jest.fn();
  const disposable = text.onChange(listener);

  text.update(trace.state);
  disposable.dispose();

  return (listener.mock.calls[0][0] as { value: string }).value;
}

/**
 * Read one description stat by its label.
 *
 * By label rather than by index: the summary gains and loses lines with the
 * chart's own shape -- a target, a band -- so a positional read passes for
 * the wrong reason on half the fixtures here.
 * @param stats The stats to search
 * @param label The stat to find
 * @returns Its value, or undefined when the summary does not carry it
 */
function read(
  stats: DescriptionStat[],
  label: string,
): string | number | number[] | undefined {
  return stats.find(stat => stat.label === label)?.value;
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

    expect(text.cross?.value).toBe(73);
    expect(text.z).toEqual({ label: 'Range', value: '0 to 100' });
  });

  test('keeps the range out of `range`, which would replace the measure', () => {
    // `TextService.formatVerboseTraceText` renders `range` *instead of*
    // `main.value`, not alongside it. Putting the dial's ends there drops the
    // measure's name from every announcement -- "Measure is 0 through 100"
    // rather than "Measure is Conversion" -- so the field has to stay unset.
    expect(nonEmptyState(gauge()).text.range).toBeUndefined();
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

describe('the announcement a reader hears', () => {
  test('names the measure, the band, the value, the range and the target', () => {
    // Asserted on the rendered sentence rather than on the `TextState`, which
    // is what a wrong field choice hides behind: the dial's ends in `range`
    // rather than `z` left every state assertion above passing while the
    // sentence read "Measure is 0 through 100" and dropped 'Conversion'.
    expect(announce(gauge())).toBe(
      'Measure is Conversion, ok Percent is 73, Range is 0 to 100, Target is 80',
    );
  });

  test('still names the measure on a bare gauge with no band or target', () => {
    const plain: GaugePoint = { label: 'Load', value: 42, min: 0, max: 50 };

    expect(announce(gauge(plain))).toBe(
      'Measure is Load, Percent is 42, Range is 0 to 50',
    );
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

  test('says a measure on its target is on it, rather than 0 above it', () => {
    // "Above target by 0" claims a direction the value does not have, and
    // leaves the reader to infer "so it is exactly on target" -- which is the
    // inference the direction labels exist to spare them.
    const { stats } = gauge({ ...KPI, value: 80 }).description;

    expect(read(stats, 'Versus target')).toBe('on target');
    expect(stats.map(stat => stat.label)).not.toContain('Above target by');
  });

  test('claims no direction against a target it could not compare with', () => {
    // `NaN >= 0` is false, so a dial with no value landed under 'Below target
    // by' with a difference the dialog then blanked -- and the claim lives in
    // the label, where blanking cannot reach it.
    const noValue = { min: 0, max: 100, target: 80 };
    const labels = gauge(noValue as unknown as GaugePoint)
      .description
      .stats
      .map(stat => stat.label);

    expect(labels).toContain('Target');
    expect(labels).not.toContain('Below target by');
    expect(labels).not.toContain('Above target by');
    expect(labels).not.toContain('Versus target');
  });

  test('reports the range and the band', () => {
    const { stats } = gauge().description;

    expect(stats).toContainEqual({ label: 'Value', value: 73 });
    expect(stats).toContainEqual({ label: 'Range', value: '0 to 100' });
    expect(stats).toContainEqual({ label: 'Band', value: 'ok' });
  });

  test('reads a dial with no declared ends as missing, not as "NaN to NaN"', () => {
    // `spanned` composes the two ends into a *string*, so a non-finite pair
    // sails past every check that blanks a non-finite number and is printed
    // and spoken verbatim.
    const { stats } = gauge({ value: 5 } as GaugePoint).description;

    expect(read(stats, 'Range')).toBe('missing');
    expect(nonEmptyState(gauge({ value: 5 } as GaugePoint)).text.z)
      .toEqual({ label: 'Range', value: 'missing' });
  });

  test('states where in its range the needle sits', () => {
    // What a sighted reader takes from the dial's geometry, and what the
    // pitch already encodes. A range that does not start at zero is the case
    // it exists for -- 500 of 0 to 100 would pass by coincidence.
    expect(read(gauge().description.stats, 'Position in range')).toBe('73.0%');
    expect(read(gauge({ value: 500, min: 200, max: 800 }).description.stats, 'Position in range'))
      .toBe('50.0%');
  });

  test('says nothing about a position on a dial with no width', () => {
    const labels = gauge({ value: 5, min: 5, max: 5 })
      .description
      .stats
      .map(stat => stat.label);

    expect(labels).not.toContain('Position in range');
  });

  test('names every band and the edge it reaches, not only the one it lands in', () => {
    // "Band: ok" without "ok reaches 75" is unanchored: a reader cannot tell
    // whether 73 sits comfortably inside the band or a point short of the
    // next one.
    expect(read(gauge().description.stats, 'All bands'))
      .toBe('poor up to 50, ok up to 75, good up to 100');
  });

  test('names the list of bands apart from the band the needle is in', () => {
    // 'Band' and 'Bands' sit next to each other in the list, and a trailing
    // sibilant is the whole of the difference a screen reader speaks between
    // "the band it is in" and "every band there is".
    const labels = gauge().description.stats.map(stat => stat.label);

    expect(labels).toContain('Band');
    expect(labels).not.toContain('Bands');
  });

  test('classifies against the placeable bands, not the array as authored', () => {
    // One band with an unreadable edge makes the comparator answer NaN for
    // every pair it takes part in, which the sort reads as "equal" -- so the
    // bands on either side of it stay where they were authored and the first
    // one above the value wins. 40 came out 'good'.
    const unreadable: GaugePoint = {
      value: 40,
      min: 0,
      max: 100,
      bands: [
        { to: 100, label: 'good' },
        { to: 'n/a' as unknown as number, label: 'weird' },
        { to: 50, label: 'poor' },
      ],
    };

    expect(read(gauge(unreadable).description.stats, 'Band')).toBe('poor');
    expect(nonEmptyState(gauge(unreadable)).text.section).toBe('poor');
    // And the edges listed agree with the band selected against them.
    expect(read(gauge(unreadable).description.stats, 'All bands'))
      .toBe('poor up to 50, good up to 100');
  });

  test('claims no band on a dial with no value to place', () => {
    // `bandOf` answers null for a measure that is not a number as well as for
    // one past every band -- every comparison against a NaN is false -- and
    // reading the first as "above every band" states a position for a value
    // the chart never reported, beside a `Value` line the dialog blanks.
    const noValue = { min: 0, max: 100, bands: [{ to: 50, label: 'poor' }] };
    const labels = gauge(noValue as unknown as GaugePoint)
      .description
      .stats
      .map(stat => stat.label);

    expect(labels).not.toContain('Band');
    // The scale the chart draws is still worth stating.
    expect(labels).toContain('All bands');
  });

  test('says the needle has passed every band rather than saying nothing', () => {
    // A chart that draws bands and a summary silent about them read alike,
    // and this is the case where the reader most needs to be told.
    const sparse: GaugePoint = {
      value: 90,
      min: 0,
      max: 100,
      bands: [{ to: 50, label: 'poor' }],
    };

    expect(read(gauge(sparse).description.stats, 'Band')).toBe('above every band');
  });

  test('omits the band stats when the chart draws none', () => {
    const labels = gauge({ value: 42, min: 0, max: 50 })
      .description
      .stats
      .map(stat => stat.label);

    expect(labels).not.toContain('Band');
    expect(labels).not.toContain('All bands');
  });

  test('omits the target stats when the chart draws no target', () => {
    const labels = gauge({ value: 42, min: 0, max: 50 })
      .description
      .stats
      .map(stat => stat.label);

    expect(labels).not.toContain('Target');
    expect(labels).not.toContain('Below target by');
    expect(labels).not.toContain('Versus target');
  });
});

describe('the description table', () => {
  test('heads its columns with the axes the announcement names', () => {
    // The Axes block, the spoken sentence and the table are three surfaces of
    // the same dialog, and a hardcoded header made them give the same number
    // three names -- with the unit, which lives in the axis label, lost in
    // the one place a reader can compare values.
    const { dataTable } = gauge().description;

    expect(dataTable.headers).toEqual(['Measure', 'Percent']);
    expect(dataTable.rows).toEqual([['Conversion', 73]]);
  });

  test('names the measure when the layer named neither it nor the chart', () => {
    // `this.title` holds the model's `unavailable` placeholder there, which
    // the dialog erases -- leaving a gauge's one row with no header at all
    // and its value announced with no name attached.
    const unnamed = TraceFactory.create({
      id: 'bare-gauge',
      type: TraceType.GAUGE,
      axes: { x: { label: 'Progress' } },
      data: { value: 42, min: 0, max: 100 },
    }) as GaugeTrace;
    unnamed.moveToIndex(0, 0);

    expect(unnamed.description.dataTable.rows).toEqual([['Measure', 42]]);
    expect(unnamed.description.dataTable.headers).toEqual(['Progress', 'Value']);
    // The announcement reads the same name, rather than the placeholder.
    expect(nonEmptyState(unnamed).text.main.value).toBe('Measure');
  });

  test('does not take a blank label for the measure\'s name', () => {
    // A producer with no name to give writes one of two spellings of none,
    // and `??` catches only `undefined`. The dialog erases a blank exactly as
    // it erases the placeholder, so the row lost its header again -- here to
    // the chart's own title, which is the next name the gauge has.
    const blank = gauge({ label: '   ', value: 42, min: 0, max: 100 });

    expect(blank.description.dataTable.rows).toEqual([['Conversion rate', 42]]);
    expect(nonEmptyState(blank).text.main.value).toBe('Conversion rate');
  });

  test('falls back to the fixed word when the blank name is all there is', () => {
    const bare = TraceFactory.create({
      id: 'blank-gauge',
      type: TraceType.GAUGE,
      axes: { x: { label: 'Progress' } },
      data: { label: '   ', value: 42, min: 0, max: 100 },
    }) as GaugeTrace;
    bare.moveToIndex(0, 0);

    expect(bare.description.dataTable.rows).toEqual([['Measure', 42]]);
    expect(nonEmptyState(bare).text.main.value).toBe('Measure');
  });
});
