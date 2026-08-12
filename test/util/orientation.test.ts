import { describe, expect, test } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { formatPlotType, resolveOrientation } from '@util/orientation';

describe('resolveOrientation', () => {
  const orientedTypes = [
    TraceType.BAR,
    TraceType.BOX,
    // The distributions run along one axis and their quantiles along the
    // other, the same as a box plot.
    TraceType.BOXEN,
    TraceType.CANDLESTICK,
    // A pyramid is drawn with its categories down the page and a Likert chart
    // with them across it, and the sides grow along the other axis either way.
    TraceType.DIVERGING,
    // A dot plot and a lollipop are a bar chart's reading with a different
    // mark, and a bar is oriented.
    TraceType.DOT,
    TraceType.LOLLIPOP,
    TraceType.DODGED,
    // A dumbbell is commonly drawn with its categories running down the page,
    // and the pair runs along the value axis either way -- so which axis a dot
    // moves on depends on which way it was drawn.
    TraceType.DUMBBELL,
    // The interval runs along the value axis and the samples along the other,
    // so which way round they are drawn decides which axis a bound moves on.
    TraceType.ERROR_BAR,
    // Lanes run one way and the axis the other, so which way round they are
    // drawn decides which axis an interval's ends move on. A timeline drawn
    // down the page is the ordinary alternative, not an exotic one.
    // Studies run down the page and the effect axis across it.
    TraceType.FOREST,
    TraceType.GANTT,
    // A funnel is drawn top to bottom as often as left to right, and the
    // stages run along one axis with the counts on the other either way.
    TraceType.FUNNEL,
    TraceType.HISTOGRAM,
    TraceType.NORMALIZED,
    // Groups run one way and the value axis the other, and a ridgeline is
    // drawn with its groups down the page as often as across it.
    TraceType.RIDGELINE,
    TraceType.STACKED,
    TraceType.VIOLIN_BOX,
    TraceType.VIOLIN_KDE,
  ];

  test.each(orientedTypes)('defaults %s to vertical when undeclared', (type) => {
    expect(resolveOrientation(type)).toBe(Orientation.VERTICAL);
  });

  test.each(orientedTypes)('keeps the declared orientation of %s', (type) => {
    expect(resolveOrientation(type, Orientation.HORIZONTAL)).toBe(Orientation.HORIZONTAL);
    expect(resolveOrientation(type, Orientation.VERTICAL)).toBe(Orientation.VERTICAL);
  });

  const unorientedTypes = [
    // An area trace is navigated along its series and then between series,
    // exactly as a line is, whichever way the band is drawn.
    TraceType.AREA,
    // Competitors are the rows and periods the columns whichever way the
    // chart is drawn -- the answer a line already gives.
    TraceType.BUMP,
    TraceType.CANDLESTICK_DELTA,
    // One measure on a dial: no second axis to swap with.
    TraceType.GAUGE,
    TraceType.HEATMAP,
    // A lattice of bins over two continuous axes, the same as a heatmap.
    TraceType.HEXBIN,
    TraceType.LINE,
    TraceType.NORMALIZED_AREA,
    // Every column is its own axis, so there is no main and cross axis to
    // swap -- a horizontal parallel coordinates plot walks the same grid.
    TraceType.PARALLEL,
    TraceType.PIE,
    // Spokes sit around a circle rather than along an axis, so there is no
    // main and cross axis to swap -- the answer a pie already gives.
    TraceType.POLAR_AREA,
    TraceType.RADAR,
    TraceType.SCATTER,
    TraceType.SMOOTH,
    TraceType.STACKED_AREA,
    TraceType.STEP,
    // A survival curve is a step chart; time runs one way either way.
    TraceType.SURVIVAL,
    // A waterfall is navigated one column per step whichever way the bars
    // are drawn, so there is no main and cross axis to swap.
    TraceType.WATERFALL,
    // Terms are packed, not laid along an axis, and are walked by weight.
    TraceType.WORD_CLOUD,
  ];

  test('answers for every trace type', () => {
    const covered = [...orientedTypes, ...unorientedTypes];
    expect(covered.sort()).toEqual(Object.values(TraceType).sort());
  });

  test.each(unorientedTypes)('reports no orientation for %s', (type) => {
    expect(resolveOrientation(type)).toBeUndefined();
  });

  test('reports no orientation for a type it does not know', () => {
    expect(resolveOrientation('not-a-trace-type')).toBeUndefined();
  });

  test('ignores an orientation declared on a type that has none', () => {
    expect(resolveOrientation(TraceType.LINE, Orientation.HORIZONTAL)).toBeUndefined();
    // Slices sit around a circle, so a producer that emits an orientation for
    // a pie anyway must not get "vertical pie" announced.
    expect(resolveOrientation(TraceType.PIE, Orientation.VERTICAL)).toBeUndefined();
  });
});

describe('formatPlotType', () => {
  test('prefixes the type with its orientation', () => {
    expect(formatPlotType('bar', Orientation.VERTICAL)).toBe('vertical bar');
    expect(formatPlotType('box', Orientation.HORIZONTAL)).toBe('horizontal box');
  });

  test('returns the bare type when there is no orientation', () => {
    expect(formatPlotType('heat')).toBe('heat');
    expect(formatPlotType('single line', undefined)).toBe('single line');
  });

  test('prefixes what resolveOrientation returns for an oriented type', () => {
    expect(formatPlotType('bar', resolveOrientation(TraceType.BAR))).toBe('vertical bar');
  });
});
