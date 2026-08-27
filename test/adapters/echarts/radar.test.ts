import type {
  EChartsComponentModel,
  EChartsInstance,
  EChartsList,
  EChartsSeriesModel,
} from '@adapters/echarts/types';
import type { LinePoint } from '@type/grammar';
import { createMaidrFromEChart } from '@adapters/echarts/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/**
 * A radar was refused by name, and the reason recorded for it was wrong.
 *
 * `grid.ts`'s footer said a two-series radar draws "six vertex symbols and
 * also fills its alternating ring backgrounds, one of which
 * (`rgb(234,237,245)`) is neither furniture nor white, so seven marks are
 * found where six are expected". That counts the wrong mark class:
 * `RadarTrace` wants one selector **per series**, and the filled marks are
 * one per *vertex* -- three per series -- so they never fitted, ring
 * background or not.
 *
 * Measured by colour-tagging a two-series, three-indicator radar, the series
 * outline is a *stroked* polyline, one per series, weighted and in the series
 * colour, with the ring and spokes unweighted beside it:
 *
 *     #dbdee4          ring outline   unweighted -> furniture
 *     #cfd2d7 x3       spokes         unweighted -> furniture
 *     #111199 width=2  series one     <- the mark
 *     #229922 width=2  series two     <- the mark
 *
 * which is the shape `markPerSeries()` already finds for a line. The fixture
 * below draws exactly that.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One observation: a name and a reading per indicator. */
interface Observation {
  name: string;
  values: (number | null)[];
}

function radarChart(
  observations: Observation[],
  indicators: (string | null)[],
  seriesName?: string,
): EChartsInstance {
  const dimensions = indicators.map((_, column) => `indicator_${column}`);
  const list: EChartsList = {
    dimensions,
    count: () => observations.length,
    getName: index => observations[index].name,
    get: (dimension, index) =>
      observations[index].values[dimensions.indexOf(dimension)],
  };

  const series: EChartsSeriesModel = {
    subType: 'radar',
    name: seriesName ?? 'series 0',
    getData: () => list,
    get: key => (key === 'name' ? seriesName : undefined),
  };

  const components: Record<string, Record<string, unknown>[]> = {
    radar: [{
      indicator: indicators.map(name =>
        (name === null ? { max: 10 } : { name, max: 10 })),
    }],
  };

  return {
    getModel: () => ({
      eachSeries: callback => callback(series, 0),
      eachComponent: (query, callback) => {
        (components[query.mainType] ?? []).forEach((options, index) => {
          const component: EChartsComponentModel = { get: key => options[key] };
          callback(component, index);
        });
      },
    }),
  };
}

/**
 * A drawn radar: `outlines` weighted strokes in the series colour, plus the
 * furniture the detection was measured against -- the unweighted ring and
 * spokes, and the filled vertex symbols and ring backgrounds that the old
 * refusal counted.
 */
function drawnRadar(outlines: number): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('chart') as HTMLElement;
  const svg = doc.createElementNS(SVG_NS, 'svg');

  const add = (attributes: Record<string, string>): void => {
    const path = doc.createElementNS(SVG_NS, 'path');
    Object.entries(attributes).forEach(([key, value]) =>
      path.setAttribute(key, value));
    svg.appendChild(path);
  };

  // The ring backgrounds: one white, one not. Both filled, neither a mark.
  add({ fill: 'rgb(255,255,255)' });
  add({ fill: 'rgb(234,237,245)' });
  // The ring outline and the spokes: stroked but unweighted.
  add({ fill: 'none', stroke: '#dbdee4' });
  add({ fill: 'none', stroke: '#cfd2d7' });
  add({ fill: 'none', stroke: '#cfd2d7' });
  add({ fill: 'none', stroke: '#cfd2d7' });
  // The vertex symbols: filled, three per outline. What the old count found.
  for (let index = 0; index < outlines * 3; index++) {
    add({ fill: '#5070dd' });
  }
  // The series outlines: stroked and weighted. What the reading pairs.
  for (let index = 0; index < outlines; index++) {
    add({ 'fill': 'none', 'stroke': '#5070dd', 'stroke-width': '2' });
  }

  container.appendChild(svg);
  return container;
}

function layersOf(chart: EChartsInstance, container: HTMLElement) {
  return createMaidrFromEChart(chart, container).subplots[0][0].layers;
}

const INDICATORS = ['alpha', 'beta', 'gamma'];
const TWO: Observation[] = [
  { name: 'one', values: [1, 2, 3] },
  { name: 'two', values: [4, 5, 6] },
];

describe('an eCharts radar', () => {
  it('is read as the radar it draws rather than refused', () => {
    // The reproduction: before this, `createMaidrFromEChart` threw
    // "Unsupported ECharts series type(s): radar" and the page lost its
    // reading outright.
    const layers = layersOf(radarChart(TWO, INDICATORS, 'R'), drawnRadar(2));

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.RADAR);
    expect(layers[0].name).toBe('R');
  });

  it('gives each observation a row and each indicator a point', () => {
    const data = layersOf(
      radarChart(TWO, INDICATORS),
      drawnRadar(2),
    )[0].data as LinePoint[][];

    expect(data).toHaveLength(2);
    expect(data[0]).toEqual([
      { x: 'alpha', y: 1, z: 'one' },
      { x: 'beta', y: 2, z: 'one' },
      { x: 'gamma', y: 3, z: 'one' },
    ]);
  });

  it('names every point with the observation it belongs to', () => {
    // `z` is how a reader tells the outlines apart, and `getName()` is the
    // only place the observation's name lives.
    const data = layersOf(
      radarChart(TWO, INDICATORS),
      drawnRadar(2),
    )[0].data as LinePoint[][];

    expect(data[1].every(point => point.z === 'two')).toBe(true);
  });

  it('names the spokes from the radar component, not from the series', () => {
    // The series' own dimensions are `indicator_0`, `indicator_1`, … --
    // positions, not names. Announcing those would tell a reader nothing
    // about what each spoke measures.
    const data = layersOf(
      radarChart(TWO, INDICATORS),
      drawnRadar(2),
    )[0].data as LinePoint[][];

    expect(data[0].map(point => point.x)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('falls back to the column name for an unnamed indicator', () => {
    const data = layersOf(
      radarChart([{ name: 'solo', values: [1, 2] }], ['named', null]),
      drawnRadar(1),
    )[0].data as LinePoint[][];

    expect(data[0].map(point => point.x)).toEqual(['named', 'indicator_1']);
  });

  it('names an unnamed observation by position rather than not at all', () => {
    const data = layersOf(
      radarChart([{ name: '', values: [1, 2, 3] }], INDICATORS),
      drawnRadar(1),
    )[0].data as LinePoint[][];

    expect(data[0][0].z).toBe('Series 1');
  });

  it('drops a spoke the observation had no reading for', () => {
    // One point shorter rather than a fabricated zero; the points that remain
    // still name their own spokes, so the rest stay put.
    const data = layersOf(
      radarChart([{ name: 'solo', values: [1, null, 3] }], INDICATORS),
      drawnRadar(1),
    )[0].data as LinePoint[][];

    expect(data[0]).toEqual([
      { x: 'alpha', y: 1, z: 'solo' },
      { x: 'gamma', y: 3, z: 'solo' },
    ]);
  });

  it('takes one selector per outline, not one per vertex', () => {
    // The correction this reading rests on. The fixture draws six filled
    // vertex symbols and two weighted strokes; the reading must pair the
    // strokes, because `RadarTrace` reads one selector per series.
    const layer = layersOf(radarChart(TWO, INDICATORS), drawnRadar(2))[0];

    expect(Array.isArray(layer.selectors)).toBe(true);
    expect(layer.selectors).toHaveLength(2);
  });

  it('withholds the selectors when they do not line up with the rows', () => {
    // A list that does not match pairs every series with the wrong outline,
    // which is worse than no highlighting at all.
    const layer = layersOf(radarChart(TWO, INDICATORS), drawnRadar(3))[0];

    expect(layer.selectors).toBeUndefined();
  });

  it('emits no layer when no observation had a reading', () => {
    expect(layersOf(
      radarChart([{ name: 'empty', values: [null, null, null] }], INDICATORS),
      drawnRadar(1),
    )).toHaveLength(0);
  });
});
