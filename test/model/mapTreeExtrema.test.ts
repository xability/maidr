import type { AbstractTrace } from '@model/abstract';
import type { ExtremaTarget } from '@type/extrema';
import type { ChoroplethPoint, MaidrLayer, TreemapPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/** Six western states; California's 95 is the highest and Washington's 10 the lowest. */
const WEST: ChoroplethPoint[] = [
  { x: 'Washington', y: 10, lat: 47.4, lon: -120.5, neighbors: ['Oregon', 'Idaho'] },
  { x: 'Idaho', y: 30, lat: 44.4, lon: -114.6, neighbors: ['Washington', 'Oregon', 'Nevada', 'Utah'] },
  { x: 'Oregon', y: 20, lat: 43.9, lon: -120.6, neighbors: ['Washington', 'Idaho', 'Nevada', 'California'] },
  { x: 'Utah', y: 85, lat: 39.5, lon: -111.7, neighbors: ['Idaho', 'Nevada'] },
  { x: 'Nevada', y: 90, lat: 39.3, lon: -116.6, neighbors: ['Oregon', 'Idaho', 'Utah', 'California'] },
  { x: 'California', y: 95, lat: 37.2, lon: -119.4, neighbors: ['Oregon', 'Nevada'] },
];

/** Five nations under two continents; India's 1,400 is the largest leaf. */
const NATIONS: TreemapPoint[] = [
  { x: 'France', y: 67, path: ['Europe'] },
  { x: 'Germany', y: 83, path: ['Europe'] },
  { x: 'Japan', y: 125, path: ['Asia'] },
  { x: 'India', y: 1400, path: ['Asia'] },
  { x: 'Korea', y: 52, path: ['Asia'] },
];

/**
 * Build a trace from a layer, as the figure does.
 * @param type The layer type
 * @param data What it carries
 * @returns The trace
 */
function traceOf(type: TraceType, data: ChoroplethPoint[] | TreemapPoint[]): AbstractTrace {
  const layer: MaidrLayer = {
    id: 'layer',
    type,
    axes: { x: { label: 'Name' }, y: { label: 'Value' } },
    data,
  };
  return TraceFactory.create(layer) as AbstractTrace;
}

/**
 * The targets as type, label and value, as the Go To dialog lists them.
 * @param trace The trace to read
 * @returns One triple per target
 */
function offered(trace: AbstractTrace): [string, string, number][] {
  return trace.getExtremaTargets().map(target => [target.type, target.label, target.value]);
}

/**
 * What a target puts the reader on, as the announcement reads it.
 * @param trace The trace to move
 * @param target The target to go to
 * @returns The name and the value read there
 */
function landing(trace: AbstractTrace, target: ExtremaTarget | undefined): unknown[] {
  if (target === undefined) {
    throw new Error('Expected a target');
  }
  trace.navigateToExtrema(target);
  const state = trace.state as NonEmptyTraceState;
  return [state.text.main.value, state.text.cross?.value];
}

describe('a choropleth\'s [ and ] go to its highest and lowest region', () => {
  test('offers the regions the description names as highest and lowest', () => {
    const trace = traceOf(TraceType.CHOROPLETH, WEST);

    expect(trace.supportsExtremaNavigation()).toBe(true);
    expect(offered(trace)).toEqual([
      ['max', 'Max point at California', 95],
      ['min', 'Min point at Washington', 10],
    ]);
  });

  test('lands on the region', () => {
    const trace = traceOf(TraceType.CHOROPLETH, WEST);
    const [highest, lowest] = trace.getExtremaTargets();

    expect(landing(trace, highest)).toEqual(['California', 95]);
    expect(landing(trace, lowest)).toEqual(['Washington', 10]);
  });

  test('never offers a region the layer gave no value', () => {
    const blank: ChoroplethPoint[] = [
      { x: 'Blank', y: Number.NaN, lat: 1, lon: 1, neighbors: ['Alpha'] },
      { x: 'Alpha', y: 5, lat: 2, lon: 1, neighbors: ['Blank', 'Beta'] },
      { x: 'Beta', y: 9, lat: 3, lon: 1, neighbors: ['Alpha'] },
    ];

    expect(offered(traceOf(TraceType.CHOROPLETH, blank))).toEqual([
      ['max', 'Max point at Beta', 9],
      ['min', 'Min point at Alpha', 5],
    ]);
  });
});

describe('a tree\'s [ and ] go to its largest and smallest leaf', () => {
  test.each([TraceType.TREEMAP, TraceType.SUNBURST, TraceType.ICICLE])(
    'offers the leaves, named by their paths, on a %s',
    (type) => {
      // A continent's total is always larger than any of its nations, so the
      // largest node of all would always be a top-level one.
      const trace = traceOf(type, NATIONS);

      expect(trace.supportsExtremaNavigation()).toBe(true);
      expect(offered(trace)).toEqual([
        ['max', 'Max point at Asia > India', 1400],
        ['min', 'Min point at Asia > Korea', 52],
      ]);
    },
  );

  test('lands on the leaf', () => {
    const trace = traceOf(TraceType.TREEMAP, NATIONS);

    expect(landing(trace, trace.getExtremaTargets()[0])[0]).toBe('India');
  });

  test('offers nothing on a tree whose nodes carry no magnitudes', () => {
    const org: TreemapPoint[] = [
      { x: 'Ada' },
      { x: 'Bo', path: ['Ada'] },
      { x: 'Cy', path: ['Ada'] },
    ];

    expect(traceOf(TraceType.TREE, org).getExtremaTargets()).toEqual([]);
  });
});
