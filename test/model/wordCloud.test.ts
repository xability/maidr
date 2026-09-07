import type { MaidrLayer, WordCloudPoint } from '@type/grammar';
import type { DescriptionStat, NonEmptyTraceState } from '@type/state';
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

/**
 * Read one description stat by its label.
 *
 * By label rather than by index: the summary gains and loses lines with the
 * cloud's own shape -- a second extreme, a term with no weight -- so a
 * positional read passes for the wrong reason on half the fixtures here.
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
    expect(text.cross?.value).toBe(412);
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
    expect(nonEmptyState(trace).text.cross?.value).toBe(10);
    expect(trace.description.stats).toContainEqual({
      label: 'Total weight',
      value: 12,
    });
  });
});

describe('a weight that is not a number', () => {
  /**
   * A corpus where one producer-sent weight does not parse.
   *
   * `WordCloudPoint.y` admits a string because producers send one, and not
   * every string is a number -- so this is the shape a real cloud arrives in,
   * not a synthetic edge case.
   */
  const UNPARSEABLE: WordCloudPoint[] = [
    { x: 'alpha', y: '12' },
    { x: 'broken', y: 'n/a' },
    { x: 'beta', y: '30' },
  ];

  test('sorts the unmeasured term last rather than wherever the comparator drops it', () => {
    // `Number('n/a') - x` is NaN, which is neither negative nor positive, so
    // the sort left the term in an arbitrary place -- and whatever landed
    // first was then reported as the heaviest.
    const walked = UNPARSEABLE.map((_, col) =>
      nonEmptyState(at(col, UNPARSEABLE)).text.main.value);

    expect(walked).toEqual(['beta', 'alpha', 'broken']);
  });

  test('names a real term as the heaviest, at a weight that is a number', () => {
    const { stats } = at(0, UNPARSEABLE).description;

    expect(read(stats, 'Heaviest term')).toBe('beta (30)');
    expect(read(stats, 'Lightest term')).toBe('alpha (12)');
  });

  test('keeps the unmeasured weight out of the corpus total', () => {
    // Summed in, the total is NaN -- which the dialog blanks, so the line
    // disappeared with nothing saying why.
    const { stats } = at(0, UNPARSEABLE).description;

    expect(read(stats, 'Total weight')).toBe(42);
    expect(read(stats, 'Terms with no weight')).toBe(1);
  });

  test('spells the missing weight out in the table rather than blanking it', () => {
    const { rows } = at(0, UNPARSEABLE).description.dataTable;

    expect(rows[2]).toEqual(['broken', 'missing', 'missing']);
  });

  test('does not offer the unmeasured term as the lightest extreme', () => {
    const targets = at(0, UNPARSEABLE).getExtremaTargets();

    expect(targets).toHaveLength(2);
    expect(targets[1]).toMatchObject({ type: 'min', value: 12, pointIndex: 1 });
  });

  test('scales the pitch across the weights that parsed', () => {
    // A NaN slips past `minMax`'s comparisons except when it lands first,
    // where it becomes the min and the max and flattens every term.
    const { audio } = nonEmptyState(at(0, UNPARSEABLE));

    expect(audio.freq.min).toBe(12);
    expect(audio.freq.max).toBe(30);
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

  test('rounds a named term\'s weight the way the announcement speaks it', () => {
    // The weight is interpolated into a string, and `DescriptionService`
    // takes a string for display text and leaves it alone -- so a cloud
    // weighted by a computed score named its heaviest term at seventeen
    // digits beside the announcement's two.
    const scored: WordCloudPoint[] = [{ x: 'a', y: 1 / 3 }, { x: 'b', y: 1 / 7 }];
    const { stats } = at(0, scored).description;

    expect(read(stats, 'Heaviest term')).toBe('a (0.33)');
    expect(read(stats, 'Lightest term')).toBe('b (0.14)');
  });

  test('claims one extreme when every term weighs the same', () => {
    // The twin of the rotor's own guard: told there is a lightest term
    // distinct from the heaviest, a reader concludes the weights differ on a
    // cloud where they do not -- and the two surfaces that answer "which term
    // is biggest" then disagree about the same data.
    const tied: WordCloudPoint[] = [{ x: 'a', y: 5 }, { x: 'b', y: 5 }];
    const labels = at(0, tied).description.stats.map(stat => stat.label);

    expect(labels).toContain('Heaviest term');
    expect(labels).not.toContain('Lightest term');
  });

  test('claims one extreme on a cloud of a single term', () => {
    const labels = at(0, [{ x: 'only', y: 5 }]).description.stats.map(stat => stat.label);

    expect(labels).not.toContain('Lightest term');
  });

  test('reports the corpus size', () => {
    const { stats } = at(0).description;

    expect(stats).toContainEqual({ label: 'Number of terms', value: 4 });
    expect(stats).toContainEqual({ label: 'Total weight', value: 830 });
  });

  test('says the rows are not in the order they were authored', () => {
    // Navigation and the table both depart from the authored order, and a
    // reader comparing either against the source data would otherwise find
    // the rows rearranged with nothing to explain it.
    expect(read(at(0).description.stats, 'Order'))
      .toBe('Terms are listed heaviest first, not as authored');
  });

  test('tabulates the terms in weight order, with each term\'s share', () => {
    // A cloud encodes prominence, and prominence is a share: 412 of 830 is
    // half the corpus, which is the reading a sighted reader takes from glyph
    // size.
    const { dataTable } = at(0).description;

    expect(dataTable.headers).toEqual(['Term', 'Occurrences', 'Share of total']);
    expect(dataTable.rows[0]).toEqual(['machine', 412, '49.6%']);
    expect(dataTable.rows[3]).toEqual(['gradient', 57, '6.9%']);
  });

  test('heads the table from the domain when the layer labelled no axes', () => {
    // `named()` falls back to the literal 'X' and 'Y', and the dialog names
    // every cell by its column header -- so a screen reader walked the table
    // announcing "X, machine, Y, 412".
    const unlabelled = TraceFactory.create({
      id: 'bare-cloud',
      type: TraceType.WORD_CLOUD,
      data: TERMS,
    }) as WordCloudTrace;

    expect(unlabelled.description.dataTable.headers)
      .toEqual(['Term', 'Weight', 'Share of total']);
  });
});
