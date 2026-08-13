import type { MaidrLayer, WordCloudPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { WordCloudTrace } from '@model/wordCloud';
import { TraceType } from '@type/grammar';

/**
 * Terms deliberately authored in an order that is neither alphabetical nor by
 * weight, so a reading that kept the authored order cannot coincide with one
 * that sorted. Every weight is distinct.
 */
const TERMS: WordCloudPoint[] = [
  { x: 'neural', y: 128 },
  { x: 'machine', y: 412 },
  { x: 'gradient', y: 57 },
  { x: 'tensor', y: 233 },
];

/** The same terms heaviest first — what navigation should walk. */
const BY_WEIGHT = ['machine', 'tensor', 'neural', 'gradient'];

/**
 * Create a minimal word cloud layer for model-only tests.
 * @param data The terms the layer carries
 * @returns Word cloud layer definition
 */
function createLayer(data: WordCloudPoint[]): MaidrLayer {
  return {
    id: 'test-word-cloud-layer',
    type: TraceType.WORD_CLOUD,
    title: 'Terms in the abstracts',
    axes: { x: { label: 'Term' }, y: { label: 'Occurrences' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: WordCloudTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a trace and place the cursor on one term.
 * @param col Term to land on
 * @param data The terms the layer carries
 * @returns The positioned trace
 */
function at(col: number, data: WordCloudPoint[] = TERMS): WordCloudTrace {
  const trace = TraceFactory.create(createLayer(data)) as WordCloudTrace;
  trace.moveToIndex(0, col);
  return trace;
}

describe('word cloud registration', () => {
  test('the factory builds a WordCloudTrace', () => {
    expect(TraceFactory.create(createLayer(TERMS))).toBeInstanceOf(WordCloudTrace);
  });

  test('announces itself as a word cloud', () => {
    expect(at(0).description.chartType).toBe('Word Cloud');
  });

  test('is a single row of terms, with no second dimension', () => {
    expect(at(0).moveOnce('DOWNWARD')).toBe(false);
  });
});

describe('reading a term', () => {
  test('walks the terms heaviest first, not as authored', () => {
    // A cloud's layout is chosen to pack glyphs, so authored order is
    // arbitrary; weight order is the only sequence the chart is read for.
    const walked = TERMS.map((_, col) => nonEmptyState(at(col)).text.main.value);

    expect(walked).toEqual(BY_WEIGHT);
  });

  test('announces the weight alongside the term', () => {
    // The number the chart encodes as glyph size and prints nowhere. Without
    // it the reader gets the terms and no way to tell which is heaviest.
    const { text } = nonEmptyState(at(0));

    expect(text.main.value).toBe('machine');
    expect(text.cross.value).toBe(412);
  });

  test('keeps ties in their authored order', () => {
    // A stable sort matters here: an unstable one would let the same chart
    // read two different ways between runs.
    const tied: WordCloudPoint[] = [
      { x: 'alpha', y: 10 },
      { x: 'beta', y: 10 },
      { x: 'gamma', y: 10 },
    ];
    const walked = tied.map((_, col) =>
      nonEmptyState(at(col, tied)).text.main.value);

    expect(walked).toEqual(['alpha', 'beta', 'gamma']);
  });
});

describe('string weights', () => {
  test('sorts, sums and announces a weight sent as a string', () => {
    // Hand-authored JSON sends numbers as strings, which is why the type
    // admits them. The running total is the assertion that matters: `sum +
    // weight` concatenates rather than adds if the coercion is ever dropped,
    // so a chart of 10 and 2 would report a total of "102".
    const asText: WordCloudPoint[] = [
      { x: 'small', y: '2' },
      { x: 'large', y: '10' },
    ];
    const trace = at(0, asText);

    expect(nonEmptyState(trace).text.main.value).toBe('large');
    expect(nonEmptyState(trace).text.cross.value).toBe(10);
    expect(trace.description.stats).toContainEqual({
      label: 'Total weight',
      value: 12,
    });
  });
});

describe('audio', () => {
  test('pitches the weight, scaled across the cloud', () => {
    const heaviest = nonEmptyState(at(0)).audio;
    const lightest = nonEmptyState(at(3)).audio;

    expect(heaviest.freq.raw).toBe(412);
    expect(heaviest.freq.min).toBe(57);
    expect(heaviest.freq.max).toBe(412);
    expect(Number(lightest.freq.raw)).toBeLessThan(Number(heaviest.freq.raw));
  });

  test('pans across the terms', () => {
    const { audio } = nonEmptyState(at(2));

    expect(audio.panning.x).toBe(2);
    expect(audio.panning.rows).toBe(1);
    expect(audio.panning.cols).toBe(4);
  });
});

describe('braille', () => {
  test('renders one row of weights in the navigated order', () => {
    const { braille } = nonEmptyState(at(1));

    expect(braille.empty).toBe(false);
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }
    expect(braille.values).toEqual([[412, 233, 128, 57]]);
    expect(braille.col).toBe(1);
  });
});

describe('extrema navigation', () => {
  test('offers the heaviest and lightest terms', () => {
    const targets = at(0).getExtremaTargets();

    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({ type: 'max', value: 412, pointIndex: 0 });
    expect(targets[1]).toMatchObject({ type: 'min', value: 57, pointIndex: 3 });
  });

  test('moves the cursor to a chosen target', () => {
    // The base `navigateToExtrema` throws when `supportsExtrema` is set, so a
    // trace advertising extrema without this is worse than one that does not.
    const trace = at(0);
    const [, lightest] = trace.getExtremaTargets();

    trace.navigateToExtrema(lightest);

    expect(nonEmptyState(trace).text.main.value).toBe('gradient');
  });

  test('offers one target when every term weighs the same', () => {
    const tied: WordCloudPoint[] = [{ x: 'a', y: 5 }, { x: 'b', y: 5 }];

    expect(at(0, tied).getExtremaTargets()).toHaveLength(1);
  });
});

describe('description', () => {
  test('names the heaviest and lightest terms', () => {
    // What a cloud is drawn to answer at a glance, and what a reader walking
    // term by term would otherwise have to hold in their head.
    const { stats } = at(0).description;

    expect(stats).toContainEqual({ label: 'Heaviest term', value: 'machine (412)' });
    expect(stats).toContainEqual({ label: 'Lightest term', value: 'gradient (57)' });
  });

  test('reports the corpus size', () => {
    const { stats } = at(0).description;

    expect(stats).toContainEqual({ label: 'Number of terms', value: 4 });
    expect(stats).toContainEqual({ label: 'Total weight', value: 830 });
  });

  test('tabulates the terms in weight order', () => {
    const { dataTable } = at(0).description;

    expect(dataTable.headers).toEqual(['Term', 'Occurrences']);
    expect(dataTable.rows[0]).toEqual(['machine', 412]);
    expect(dataTable.rows[3]).toEqual(['gradient', 57]);
  });
});
