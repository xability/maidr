import type { LineTrace } from '@model/line';
/**
 * What the chart description dialog says about a line layer.
 *
 * `LineTrace.description` is the only full description getter in the family --
 * step, area, smooth, radar, contour, bump, parallel and survival all extend it
 * -- so a defect here is a defect in nine chart types at once. These cases pin
 * the facts a reader can get nowhere else: how far the chart runs, how many
 * samples have no reading, whether the series are ragged, and whether the table
 * they are reading is the whole one.
 */
import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { DescriptionState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * Build a line layer over the given samples.
 *
 * `selectors` is omitted so the trace needs no DOM.
 *
 * @param data - The samples, one array per series
 * @param axes - The axes the layer authors, defaulting to x and y alone
 * @returns A layer definition
 */
function layer(
  data: LinePoint[][],
  axes: MaidrLayer['axes'] = { x: { label: 'X' }, y: { label: 'Y' } },
): MaidrLayer {
  return {
    id: 'line-description-layer',
    type: TraceType.LINE,
    title: 'Series',
    axes,
    data,
  };
}

/**
 * Build the trace and read its description.
 *
 * @param data - The samples, one array per series
 * @param axes - The axes the layer authors
 * @returns The description state
 */
function describedBy(
  data: LinePoint[][],
  axes?: MaidrLayer['axes'],
): DescriptionState {
  return (TraceFactory.create(layer(data, axes)) as LineTrace).description;
}

/**
 * Read one stat by its label, never by its position.
 *
 * @param description - The description to read
 * @param label - The stat's label
 * @returns The value, or undefined when the stat is absent
 */
function statOf(
  description: DescriptionState,
  label: string,
): string | number | undefined {
  return description.stats.find(stat => stat.label === label)?.value;
}

/** Two series of equal length, both named. */
const PAIRED: LinePoint[][] = [
  [{ x: 1, y: 3, z: 'A' }, { x: 2, y: 5, z: 'A' }],
  [{ x: 1, y: 4, z: 'B' }, { x: 2, y: 6, z: 'B' }],
];

describe('how many points each series has', () => {
  test('states one number when the series agree', () => {
    expect(statOf(describedBy(PAIRED), 'Points per line')).toBe(2);
  });

  test('states a span when they do not', () => {
    // The label is a claim about every line. A hue level missing a category
    // makes a chart of two and four points, and the widest one's length was
    // reported for both -- so a reader walking the short one hit its end at
    // two with nothing in the dialog to explain why.
    const ragged: LinePoint[][] = [
      [{ x: 1, y: 3 }, { x: 2, y: 5 }],
      [{ x: 1, y: 4 }, { x: 2, y: 6 }, { x: 3, y: 7 }, { x: 4, y: 8 }],
    ];

    expect(statOf(describedBy(ragged), 'Points per line')).toBe('2 to 4');
  });

  test('leaves an empty series out of the span rather than calling it zero', () => {
    const withEmpty: LinePoint[][] = [[], [{ x: 1, y: 4 }, { x: 2, y: 6 }]];

    expect(statOf(describedBy(withEmpty), 'Points per line')).toBe(2);
  });

  test('gives the size of the whole chart beside it', () => {
    // The number a span of per-series lengths no longer yields and a reader
    // cannot recover from one.
    expect(statOf(describedBy(PAIRED), 'Total points')).toBe(4);
  });

  test('says nothing about a total for a single series, which is the count', () => {
    expect(statOf(describedBy([PAIRED[0]]), 'Total points')).toBeUndefined();
  });
});

describe('where the chart runs', () => {
  test('names the extent under the x axis', () => {
    // "What period does this cover?" is the first question a reader brings to
    // a series over time, and it was answerable only by walking to both ends.
    expect(statOf(describedBy(PAIRED), 'X range')).toBe('1 to 2');
  });

  test('reads a numeric axis low to high whichever order it was emitted in', () => {
    const backwards: LinePoint[][] = [[{ x: 9, y: 1 }, { x: 2, y: 2 }]];

    expect(statOf(describedBy(backwards), 'X range')).toBe('2 to 9');
  });

  test('reads a categorical axis in the order it is drawn', () => {
    const quarters: LinePoint[][] = [[
      { x: 'Q1', y: 1 },
      { x: 'Q2', y: 2 },
      { x: 'Q3', y: 3 },
    ]];

    expect(statOf(describedBy(quarters), 'X range')).toBe('Q1 to Q3');
  });

  test('takes the widest series, so a ragged layer still answers', () => {
    const ragged: LinePoint[][] = [
      [{ x: 1, y: 3 }],
      [{ x: 1, y: 4 }, { x: 2, y: 6 }, { x: 3, y: 7 }],
    ];

    expect(statOf(describedBy(ragged), 'X range')).toBe('1 to 3');
  });

  test('says nothing at all for a layer with no samples', () => {
    expect(statOf(describedBy([]), 'X range')).toBeUndefined();
  });
});

describe('a chart with nothing measured', () => {
  test('reports the range as missing rather than as an infinity', () => {
    // `safeMin`/`safeMax` answer an empty set with the infinities, which the
    // dialog drops silently -- so the summary jumped from the point counts
    // straight to the table with no word about the range at all.
    const description = describedBy([[{ x: 1, y: null }, { x: 2, y: null }]]);

    expect(statOf(description, 'Min value')).toBe('missing');
    expect(statOf(description, 'Max value')).toBe('missing');
  });

  test('reports it for a layer carrying no series either', () => {
    const description = describedBy([]);

    expect(statOf(description, 'Min value')).toBe('missing');
    expect(statOf(description, 'Max value')).toBe('missing');
  });
});

describe('the series column', () => {
  test('is headed with the z axis the layer named', () => {
    // The dialog's own Axes block prints "z: Species" three lines above, and
    // every keypress says "Species is setosa"; a column headed `Line` under
    // those puts three words for one referent in one dialog.
    const described = describedBy(PAIRED, {
      x: { label: 'X' },
      y: { label: 'Y' },
      z: { label: 'Species' },
    });

    expect(described.dataTable.headers).toEqual(['X', 'Y', 'Species']);
  });

  test('keeps the line\'s own noun when the layer names no z axis', () => {
    expect(describedBy(PAIRED).dataTable.headers).toEqual(['X', 'Y', 'Line']);
  });
});

describe('a single series the layer named', () => {
  test('is named in the summary too', () => {
    // `text` announces "Group is Night one" on every move, and the dialog that
    // exists to hold the chart's metadata said nothing about it.
    const one: LinePoint[][] = [[{ x: 1, y: 3, z: 'Night one' }]];

    expect(statOf(describedBy(one), 'Group')).toBe('Night one');
  });

  test('under the label the announcement uses', () => {
    const one: LinePoint[][] = [[{ x: 1, y: 3, z: 'setosa' }]];
    const described = describedBy(one, {
      x: { label: 'X' },
      y: { label: 'Y' },
      z: { label: 'Species' },
    });

    expect(statOf(described, 'Species')).toBe('setosa');
    // Singular, so it does not read as a list of one.
    expect(statOf(described, 'Line names')).toBeUndefined();
  });

  test('says nothing when the layer named nothing', () => {
    const described = describedBy([[{ x: 1, y: 3 }]]);

    expect(statOf(described, 'Group')).toBeUndefined();
  });
});

describe('how many samples have no reading', () => {
  test('is counted across every series', () => {
    const gapped: LinePoint[][] = [
      [{ x: 1, y: null }, { x: 2, y: 5 }],
      [{ x: 1, y: 4 }, { x: 2, y: null }],
    ];

    expect(statOf(describedBy(gapped), 'Missing values')).toBe(2);
  });

  test('is not mentioned on a chart that measured everything', () => {
    expect(statOf(describedBy(PAIRED), 'Missing values')).toBeUndefined();
  });
});

describe('a data table longer than the dialog will show', () => {
  test('is cut to a thousand rows, and says so', () => {
    // Every cell of every row is formatted afresh on each press of `d`, and a
    // count claiming the whole layer over a table holding two thirds of it is
    // worse than no table.
    const dense: LinePoint[][] = [
      Array.from({ length: 1500 }, (_, i) => ({ x: i, y: i % 7 })),
    ];
    const described = describedBy(dense);

    expect(described.dataTable.rows).toHaveLength(1000);
    expect(statOf(described, 'Table rows')).toBe('first 1000 of 1500');
  });

  test('a table that fits says nothing about a cut', () => {
    expect(statOf(describedBy(PAIRED), 'Table rows')).toBeUndefined();
  });
});
