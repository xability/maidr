/**
 * What these tests protect.
 *
 * The Observable Plot adapter recovers data by inverting pixels. Nothing in
 * that pipeline fails loudly: a scale read the wrong way round, an inset
 * mistaken for a bin edge, or a stack walked in the wrong direction all
 * produce a perfectly well-formed schema full of numbers that were never in
 * the chart. A sighted developer would not notice — the picture is unchanged —
 * and a screen-reader user would be told, confidently, the wrong value.
 *
 * So the assertions here are on the *data*, against charts rendered by the
 * real Plot from data written down in the test. If the adapter recovers the
 * numbers the chart was drawn from, every step in between was right.
 */

import type { BarPoint, HistogramPoint, LinePoint, MaidrLayer, ScatterPoint, SegmentedPoint } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { Orientation, TraceType } from '@type/grammar';
import { mountFixture } from './helpers';

/** Converts a fixture and returns its single layer. */
function onlyLayer(key: Parameters<typeof mountFixture>[0], withScales = true): MaidrLayer {
  const { element } = mountFixture(key, withScales);
  const maidr = observablePlotToMaidr(element);
  if (!maidr)
    throw new Error(`fixture "${String(key)}" produced no schema`);
  expect(maidr.subplots).toHaveLength(1);
  expect(maidr.subplots[0]).toHaveLength(1);
  expect(maidr.subplots[0][0].layers).toHaveLength(1);
  return maidr.subplots[0][0].layers[0];
}

describe('bar marks', () => {
  it('recovers the categories and values of a vertical bar chart', () => {
    const layer = onlyLayer('bar');

    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.orientation).toBe(Orientation.VERTICAL);
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Mon', y: 20 },
      { x: 'Tue', y: 14 },
      { x: 'Wed', y: 23 },
    ]);
  });

  it('reads the axis labels without the direction arrows Plot draws', () => {
    // Plot renders the y label as "↑ Count". The arrow tells a sighted reader
    // which way the axis runs and is noise in an announcement.
    expect(onlyLayer('bar').axes).toEqual({
      x: { label: 'Day' },
      y: { label: 'Count' },
    });
  });

  it('takes the title and caption from the figure Plot wrapped the chart in', () => {
    const { element } = mountFixture('bar');
    const maidr = observablePlotToMaidr(element);

    expect(maidr?.title).toBe('Tips by day');
    expect(maidr?.caption).toBe('Three days.');
  });

  it('reads a horizontal bar chart from the axis that carries the categories', () => {
    // barX and barY both render as <g aria-label="bar">, so orientation can
    // only come from which scale is a band.
    const layer = onlyLayer('horizontalBar');

    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Mon', y: 20 },
      { x: 'Tue', y: 14 },
      { x: 'Wed', y: 23 },
    ]);
  });
});

describe('stacked bar marks', () => {
  it('splits the segments into one series per fill colour', () => {
    const { element } = mountFixture('stacked');
    const maidr = observablePlotToMaidr(element);
    const subplot = maidr?.subplots[0][0];
    const layer = subplot?.layers[0];

    expect(layer?.type).toBe(TraceType.STACKED);
    expect(subplot?.legend).toEqual(['Alpha', 'Beta']);
    expect(layer?.data as SegmentedPoint[][]).toEqual([
      [{ x: 'A', y: 1, z: 'Alpha' }, { x: 'B', y: 3, z: 'Alpha' }],
      [{ x: 'A', y: 2, z: 'Beta' }, { x: 'B', y: 4, z: 'Beta' }],
    ]);
  });

  it('declares the order the segments were drawn in', () => {
    // A segmented layer gets one selector for every segment and pairs it with
    // the data by walking the matches in document order, so it has to be told
    // which way that order runs. This fixture's data is grouped by series, so
    // Plot drew all of Alpha and then all of Beta.
    expect(onlyLayer('stacked').domMapping).toEqual({ order: 'row' });
  });
});

describe('dot and line marks', () => {
  it('keeps a scatter plot\'s coordinates exact', () => {
    // Inverting a pixel is a divide and a multiply, so 2.25 comes back as
    // 2.2499999999999996 unless the noise is removed.
    const layer = onlyLayer('scatter');

    expect(layer.type).toBe(TraceType.SCATTER);
    expect(layer.data as ScatterPoint[]).toEqual([
      { x: 1.5, y: 2.25 },
      { x: 3.75, y: 9.125 },
    ]);
  });

  it('reads one series per drawn path, named by its stroke colour', () => {
    const { element } = mountFixture('multiline');
    const maidr = observablePlotToMaidr(element);
    const subplot = maidr?.subplots[0][0];

    expect(subplot?.layers[0].type).toBe(TraceType.LINE);
    expect(subplot?.legend).toEqual(['a', 'b']);
    expect(subplot?.layers[0].data as LinePoint[][]).toEqual([
      [{ x: 1, y: 2, z: 'a' }, { x: 2, y: 3, z: 'a' }],
      [{ x: 1, y: 5, z: 'b' }, { x: 2, y: 1, z: 'b' }],
    ]);
  });
});

describe('binned rect marks', () => {
  it('reconstructs bin edges Plot\'s inset would otherwise shift', () => {
    // Plot moves a binned rect's left edge in by a pixel and leaves its right
    // edge alone, so the first bin measures as [0.024, 2] instead of [0, 2].
    const layer = onlyLayer('histogram');
    const data = layer.data as HistogramPoint[];

    expect(layer.type).toBe(TraceType.HISTOGRAM);
    expect(data.map(bin => [bin.xMin, bin.xMax])).toEqual([
      [0, 2],
      [2, 4],
      [4, 6],
      [6, 8],
      [8, 10],
      [10, 12],
      [12, 14],
    ]);
    expect(data.map(bin => bin.y)).toEqual([7, 6, 6, 6, 6, 6, 3]);
  });
});

describe('faceted plots', () => {
  it('becomes one subplot per facet, in the facet scale\'s order', () => {
    const { element } = mountFixture('facet');
    const maidr = observablePlotToMaidr(element);

    expect(maidr?.subplots).toHaveLength(1);
    expect(maidr?.subplots[0]).toHaveLength(2);
    expect(maidr?.subplots[0][0].layers[0].data as BarPoint[]).toEqual([
      { x: 'x', y: 1 },
      { x: 'y', y: 2 },
    ]);
    expect(maidr?.subplots[0][1].layers[0].data as BarPoint[]).toEqual([
      { x: 'x', y: 3 },
      { x: 'y', y: 5 },
    ]);
  });

  it('names each panel after the facet it was drawn for', () => {
    // Without this a reader moving between panels is told "bar plot" twice and
    // never which facet they are in, which is the whole content of the split.
    const { element } = mountFixture('facet');
    const maidr = observablePlotToMaidr(element);

    expect(maidr?.subplots[0][0].layers[0].name).toBe('F1');
    expect(maidr?.subplots[0][1].layers[0].name).toBe('F2');
  });

  it('carries the shared axis labels at the figure level', () => {
    const { element } = mountFixture('facet');
    const maidr = observablePlotToMaidr(element);

    expect(maidr?.axes).toEqual({ x: { label: 'a' }, y: { label: 'v' } });
  });
});

describe('charts without Plot\'s scale function', () => {
  it('fits the scales from the axis ticks instead', () => {
    // `scale` is an own property of the node Plot returned and does not
    // survive serialization, so a chart revived from saved HTML — or moved
    // with innerHTML — arrives without it. Every tick Plot drew is still
    // there, which is enough to recover the same values.
    const layer = onlyLayer('bar', false);

    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Mon', y: 20 },
      { x: 'Tue', y: 14 },
      { x: 'Wed', y: 23 },
    ]);
  });
});

describe('marks the adapter does not read', () => {
  it('returns null rather than guessing at a heatmap', () => {
    // A cell mark keeps its magnitude in an 8-bit fill colour, so distinct
    // values render as one colour and cannot be told apart. Announcing an
    // approximation to a reader who cannot check it against the picture is
    // worse than announcing nothing.
    const { element } = mountFixture('bar');
    const bars = element.querySelector('g[aria-label="bar"]');
    bars?.setAttribute('aria-label', 'cell');

    expect(observablePlotToMaidr(element)).toBeNull();
  });
});

describe('caller overrides', () => {
  it('prefers supplied labels over the ones Plot drew', () => {
    const { element } = mountFixture('bar');
    const maidr = observablePlotToMaidr(element, {
      id: 'fixed-id',
      title: 'Weekly visitors',
      axes: { x: 'Weekday', y: 'Visitors' },
    });

    expect(maidr?.id).toBe('fixed-id');
    expect(maidr?.title).toBe('Weekly visitors');
    expect(maidr?.subplots[0][0].layers[0].axes).toEqual({
      x: { label: 'Weekday' },
      y: { label: 'Visitors' },
    });
  });
});
