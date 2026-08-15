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
    // Transposed, because a horizontal layer's measurement is read from `x`.
    // `traceContract.test.ts` is what says that is the right way round.
    expect(layer.data as BarPoint[]).toEqual([
      { x: 20, y: 'Mon' },
      { x: 14, y: 'Tue' },
      { x: 23, y: 'Wed' },
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
    // Without this a reader moving between panels hears "Subplot 2 of 2: this
    // is a bar plot" and is never told which facet they are in, which is the
    // whole content of the split. The name has to go on the layer's `title`:
    // that is where focusedSubplotTitle (src/model/plot.ts) reads a panel's
    // name from, and `name` surfaces only on a layer switch *within* a panel.
    const { element } = mountFixture('facet');
    const maidr = observablePlotToMaidr(element);

    expect(maidr?.subplots[0][0].layers[0].title).toBe('F1');
    expect(maidr?.subplots[0][1].layers[0].title).toBe('F2');
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

describe('values the drawn geometry cannot state exactly', () => {
  it('carries a date axis as milliseconds and says it is a date', () => {
    // A temporal axis inverts to a Date, and every trace's point type is
    // numeric because the value drives sonification and the min/max range.
    // Parsing the date's text into that numeric field is the trap: an ISO
    // timestamp read as a number is its *year*, so a scatter drawn across five
    // months would announce both points as 2024.
    const layer = onlyLayer('timeScatter');
    const data = layer.data as ScatterPoint[];

    expect(data.map(point => point.x)).toEqual([
      Date.UTC(2024, 0, 15),
      Date.UTC(2024, 5, 1),
    ]);
    expect(layer.axes?.x?.format).toEqual({ type: 'date' });
  });

  it('rounds a line to the precision its path was written at', () => {
    // A line's vertices come back out of the `d` attribute, where the
    // serializer has already rounded them. Over a span of thousands that
    // quantum is worth more than a unit of data, so reporting the inverted
    // figure in full would present a rounded pixel as an exact measurement.
    const layer = onlyLayer('preciseLine');
    const [series] = layer.data as LinePoint[][];

    expect(series.map(point => point.y)).toEqual([1234.6, 9876.5, 4321.1]);
  });

  it('refuses a log axis it can only fit a straight line to', () => {
    // The tick-derived fallback fits a line through the outermost ticks, which
    // describes a linear axis and not a log one. Left to guess, it did worse
    // than fit badly: this axis is labelled 10, 100, 1k, 10k, most of which do
    // not parse as numbers, so the axis was taken for a set of *categories* and
    // the chart came back transposed — a horizontal dot plot whose x values
    // were the y axis's tick text. Better unbound than either.
    const { element } = mountFixture('logAxis', false);

    expect(observablePlotToMaidr(element)).toBeNull();
  });

  it('reads a log axis correctly when Plot\'s own scale is there', () => {
    const { element } = mountFixture('logAxis');
    const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];

    expect((layer?.data as ScatterPoint[]).map(point => point.y)).toEqual([10, 1000]);
  });
});

describe('binned marks that are not plain histograms', () => {
  it('reads a stacked histogram as a stacked bar, not as double the bins', () => {
    // binX with a fill draws each bin as one rect per series. Counted as a bin
    // apiece that is twice as many bins, each with half the count — a chart
    // that reads as plausible and is wrong throughout.
    const { element } = mountFixture('stackedHistogram');
    const subplot = observablePlotToMaidr(element)?.subplots[0][0];
    const layer = subplot?.layers[0];

    expect(layer?.type).toBe(TraceType.STACKED);
    expect(subplot?.legend).toHaveLength(2);
    const series = layer?.data as SegmentedPoint[][];
    expect(series).toHaveLength(2);
    // Five bins of four per series: forty points split evenly.
    expect(series[0].map(point => point.x)).toEqual([1, 3, 5, 7, 9]);
    expect(series[0].map(point => point.y)).toEqual([4, 4, 4, 4, 4]);
  });

  it('orders a reversed axis\'s bin bounds low to high', () => {
    // A reversed axis draws the interval's larger value at the smaller pixel,
    // and states its domain high-to-low. Read literally the bin reports a
    // minimum above its maximum, which is an empty range.
    const layer = onlyLayer('reversedHistogram');
    const data = layer.data as HistogramPoint[];

    expect(data.map(bin => [bin.xMin, bin.xMax])).toEqual([
      [0, 2],
      [2, 4],
      [4, 6],
      [6, 8],
      [8, 10],
    ]);
  });
});

describe('composite marks', () => {
  it('leaves a box plot alone rather than reading its box as a bar', () => {
    // Plot.boxY is four marks — a rule for the whiskers, a bar for the
    // interquartile box, a tick for the median, a dot for the outliers — and
    // nothing in the DOM says they belong together. Read individually, the bar
    // is an ordinary bar mark whose height is q3 - q1, so a reader is told a
    // number that appears nowhere in the data while the median and the whiskers
    // are never announced at all.
    const { element } = mountFixture('boxPlot');

    expect(observablePlotToMaidr(element)).toBeNull();
  });

  it('leaves a horizontal box plot alone as well', () => {
    // `boxX` stacks the same four marks the other way round, so a test that
    // only knows the vertical arrangement passes while half the cases fail.
    const { element } = mountFixture('boxHorizontal');

    expect(observablePlotToMaidr(element)).toBeNull();
  });

  it('finds the box even when another rule is drawn first', () => {
    // Taking the first mark of each kind lets an unrelated `ruleY([0])` occupy
    // the whisker's place, and the box plot is then read after all — the exact
    // mis-announcement the check exists to prevent. `ruleY([0])` in front of a
    // box plot is an ordinary thing to write.
    const { element } = mountFixture('ruleThenBox');

    expect(observablePlotToMaidr(element)).toBeNull();
  });

  it('leaves a faceted box plot alone, outliers included', () => {
    // Plot draws a facet's outlier group only where that facet has outliers, so
    // a check that counts a mark's children counts facets for some marks and
    // elements for others. The outlier mark then survives on its own and the
    // chart presents itself as a complete scatter of the outliers.
    const { element } = mountFixture('facetedBox');

    expect(observablePlotToMaidr(element)).toBeNull();
  });

  it('reads an error-bar chart that happens to use the same three marks', () => {
    // A bar, a rule and a tick per category is also an error-bar chart with a
    // target line. What makes a box plot is where the parts sit: the median
    // inside the box, the whisker around it. Here neither holds, and skipping
    // the chart would make an ordinary bar chart silently unreachable.
    const { element } = mountFixture('errorBarsWithTarget');
    const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];

    expect(layer?.type).toBe(TraceType.BAR);
    expect((layer?.data as BarPoint[]).map(point => point.y)).toEqual([5, 3, 8]);
  });

  it('still reads a bar chart drawn with a baseline rule', () => {
    // The composite is recognised by its parts arriving with one element each
    // per distribution. A baseline `ruleY([0])` draws one line however many
    // bars there are, so an ordinary bar chart must not look like a box plot.
    const { element } = mountFixture('barWithRule');
    const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];

    expect(layer?.type).toBe(TraceType.BAR);
    expect(layer?.data as BarPoint[]).toEqual([{ x: 'a', y: 1 }, { x: 'b', y: 3 }]);
  });
});

describe('pairing data with the elements it describes', () => {
  it('puts pre-binned rects in axis order and moves the elements to match', () => {
    // MAIDR pairs a layer's selector with its data by position, and a selector
    // resolves in *document* order. Sorting the data alone moves the values and
    // leaves the highlight behind: every announcement stays correct while the
    // wrong bar lights up.
    const { document, element } = mountFixture('unsortedBins');
    const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];
    const data = layer?.data as HistogramPoint[];

    expect(data.map(bin => [bin.xMin, bin.xMax])).toEqual([[0, 2], [2, 4], [4, 6]]);

    const matched = Array.from(document.querySelectorAll(layer?.selectors as string));
    expect(matched).toHaveLength(data.length);
    // The nth match is the nth datum, so their heights have to agree.
    expect(matched.map(node => Number(node.getAttribute('height')))).toEqual(
      [...matched].map(node => Number(node.getAttribute('height'))).sort((a, b) => a - b),
    );
  });

  it('orders a stack by the axis, not by the order the rows arrived', () => {
    // Plot draws in data order, which for a stack out of a database is whatever
    // the rows were sorted by. This fixture is neither series-major nor
    // category-major, and its categories are drawn Q1, Q2, Q1, Q2, Q3, Q3.
    const { document, element } = mountFixture('mixedOrderStack');
    const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];
    const series = layer?.data as SegmentedPoint[][];

    expect(layer?.type).toBe(TraceType.STACKED);
    expect(series[0].map(point => point.x)).toEqual(['Q1', 'Q2', 'Q3']);
    expect(layer?.domMapping).toEqual({ order: 'row' });

    // Document order now runs series by series across the categories, which is
    // what `order: 'row'` claims — by construction rather than by inspection.
    const matched = Array.from(document.querySelectorAll(layer?.selectors as string));
    expect(matched).toHaveLength(6);
    expect(matched.map(node => node.getAttribute('fill'))).toEqual([
      ...Array.from({ length: 3 }, () => matched[0].getAttribute('fill')),
      ...Array.from({ length: 3 }, () => matched[3].getAttribute('fill')),
    ]);
  });

  it('reads duplicate segments as a plain bar rather than dropping them', () => {
    // Two rows sharing a category and a series draw two rects that the stack
    // transform did not aggregate. The grid has one cell for them, so the
    // counts diverge and every later highlight shifts by one — and one of the
    // two values disappears from the announcement.
    const { document, element } = mountFixture('duplicateStack');
    const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];

    expect(layer?.type).toBe(TraceType.BAR);
    expect(layer?.data as BarPoint[]).toHaveLength(5);
    expect(document.querySelectorAll(layer?.selectors as string)).toHaveLength(5);
  });
});

describe('histograms binned down the other axis', () => {
  it('reads a horizontal histogram from the axis its bins run along', () => {
    // `binX` and `binY` both draw a `rect` mark, and nothing in the DOM says
    // which axis was binned. Assuming the vertical case turns a horizontal
    // histogram into a set of identical bars whose value is the width of a bin
    // — the same number for every one of them, none of it in the data.
    const layer = onlyLayer('horizontalHistogram');
    const data = layer.data as HistogramPoint[];

    expect(layer.type).toBe(TraceType.HISTOGRAM);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    // Bounds on the binned axis and the count on the other one, which for a
    // horizontal layer is the opposite pair from a vertical one.
    expect(data.map(bin => [bin.yMin, bin.yMax])).toEqual([
      [0, 2],
      [2, 4],
      [4, 6],
      [6, 8],
      [8, 10],
    ]);
    expect(data.map(bin => bin.x)).toEqual([8, 8, 8, 8, 8]);
  });
});

describe('a stack whose series do not all reach every category', () => {
  it('orders the bins along the axis, not by which series was drawn first', () => {
    // Plot draws a stacked histogram series-major, so the bin order in the DOM
    // is whichever bins the *first* series occupied and then the ones the rest
    // added. Taking the categories from that order announces the right-hand
    // half of the chart first — and, because the pairing is positional,
    // mis-highlights every cell after the seam. A series missing from a bin is
    // the normal shape of a stacked histogram, not an edge case.
    const { document, element } = mountFixture('gappyStackedHistogram');
    const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];
    const grid = layer?.data as SegmentedPoint[][];

    expect(layer?.type).toBe(TraceType.STACKED);
    expect(grid[0].map(point => point.x)).toEqual([1, 3, 5, 7, 9]);

    // One element per cell that has one, in the order the grid reads.
    const matched = document.querySelectorAll(layer?.selectors as string);
    const filled = grid.flat().filter(point => point.y !== 0);
    expect(matched).toHaveLength(filled.length);
  });
});

describe('an axis whose span dwarfs its smallest values', () => {
  it('keeps a millionth on a log axis that runs to a billion', () => {
    // Rounding is sized from the domain span, which on a log axis is a terrible
    // guide to what any one value needs: a span of 1e9 leaves one decimal
    // place, and everything below a tenth becomes zero. A log axis is exactly
    // where the small values carry the meaning.
    const layer = onlyLayer('wideLogAxis');

    expect((layer.data as ScatterPoint[]).map(point => point.y)).toEqual([
      1e-6,
      1e-3,
      1,
      1e3,
      1e9,
    ]);
  });
});

describe('a stack the drawn rects cannot be laid out as a grid', () => {
  it('reads a stack with both a zero segment and a gap as plain bars', () => {
    // A stacked layer's data is a rectangular grid — every series, every
    // category — and MAIDR pairs it with the elements by position. Plot draws
    // neither a rect for a combination that has no row nor a distinguishable
    // one for a zero, and when a chart has both, the two cancel out: the counts
    // agree, so nothing looks wrong, while every cell past the first gap is
    // announced against the wrong bar. Announced as plain bars each element
    // carries its own value and the pairing is exact.
    const { document, element } = mountFixture('zeroAndGappyStack');
    const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];
    const data = layer?.data as BarPoint[];

    expect(layer?.type).toBe(TraceType.BAR);
    expect(data.map(point => [point.x, point.y])).toEqual([
      ['Feb', 7],
      ['Feb', 2],
      ['Jan', 0],
      ['Jan', 4],
      ['Mar', 5],
    ]);
    expect(document.querySelectorAll(layer?.selectors as string)).toHaveLength(data.length);
  });
});

describe('histograms binned down an axis that also runs backwards', () => {
  it('bins along the axis the bars stand on, not the one they grow along', () => {
    // The orientation of a binned rect was taken from which axis its bars were
    // longer on, which a reversed axis inverts: the bins were read off the
    // frequency axis and every bar reported the same made-up interval. Deciding
    // from the baseline the bars stand on holds either way round.
    const layer = onlyLayer('reversedHorizontalHistogram');
    const data = layer.data as HistogramPoint[];

    expect(layer.type).toBe(TraceType.HISTOGRAM);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(data.map(bin => [bin.yMin, bin.yMax])).toEqual([
      [0, 2],
      [2, 4],
      [4, 6],
      [6, 8],
      [8, 10],
    ]);
    expect(data.map(bin => bin.x)).toEqual([8, 8, 8, 8, 8]);
  });

  it('splits a horizontal histogram into series the same way a vertical one splits', () => {
    const { element } = mountFixture('stackedHorizontalHistogram');
    const subplot = observablePlotToMaidr(element)?.subplots[0][0];
    const layer = subplot?.layers[0];
    const series = layer?.data as SegmentedPoint[][];

    expect(layer?.type).toBe(TraceType.STACKED);
    expect(layer?.orientation).toBe(Orientation.HORIZONTAL);
    expect(subplot?.legend).toHaveLength(2);
    // Horizontal, so the bin midpoint is the category on `y` and the count is
    // the measurement on `x`.
    expect(series[0].map(point => point.y)).toEqual([1, 3, 5, 7, 9]);
    expect(series.flat().map(point => point.x)).toEqual(Array.from({ length: 10 }, () => 4));
  });
});

describe('dot marks Plot did not draw as circles', () => {
  it('orders a dot plot by its categories whatever shape the points are', () => {
    // `symbol` makes Plot draw each point as a `<path>` instead of a `<circle>`,
    // which changes nothing about what the mark means. A reader moving along
    // the axis expects the categories in the axis's order, and the elements
    // have to be moved to match or the highlight trails the announcement.
    const { document, element } = mountFixture('symbolDots');
    const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];
    const data = layer?.data as BarPoint[];

    expect(data.map(point => [point.x, point.y])).toEqual([['a', 5], ['b', 4], ['c', 3]]);
    // Plot drew them c, a, b — the order the rows arrived in — so the pixels
    // the selector resolves to say whether the elements followed the data.
    const matched = Array.from(document.querySelectorAll(layer?.selectors as string));
    const centres = matched.map(node => node.getAttribute('transform'));
    expect(centres).toEqual(['translate(137,20)', 'translate(330,195)', 'translate(523,370)']);
  });

  it('keeps every point of a scatter Plot split by colour', () => {
    // A colour channel splits one dot mark into one group per series. Reading
    // only the first group drops the rest of the chart silently.
    const { document, element } = mountFixture('seriesDots');
    const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];
    const data = layer?.data as ScatterPoint[];

    expect(data.map(point => [point.x, point.y])).toEqual([[1, 2], [2, 3], [1, 5], [2, 1]]);
    expect(document.querySelectorAll(layer?.selectors as string)).toHaveLength(4);
  });
});
