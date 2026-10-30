/**
 * @jest-environment jsdom
 */

/**
 * A Vega-Lite chart split by `stroke` or `strokeDash` is read as one series
 * per group, as one split by colour is.
 *
 * Vega-Lite draws a line per value of a field bound to `stroke` or
 * `strokeDash`, stacks bars and areas by one, and gives it a legend. The
 * converter read a layer's series off `color` and `fill` alone, so a chart
 * split by one of the other two only was read as one series: a line ran
 * through every group's points in row order, and bars stacked by `stroke`
 * were read as one plain bar per segment.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { LinePoint, Maidr, MaidrLayer, SegmentedPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { initMaidrOnElement } from '@util/initMaidr';
import { bindVegaLite } from '../../../src/vegalite-entry';

jest.mock('@util/initMaidr', () => ({ initMaidrOnElement: jest.fn() }));
const initMock = initMaidrOnElement as unknown as jest.Mock;

const SVG_NS = 'http://www.w3.org/2000/svg';

const ROWS = [1, 2, 3].flatMap(x => [
  { x, model: 'Fast', v: x * 2 },
  { x, model: 'Slow', v: x },
]);

/**
 * A chart over the rows, split by the given channel.
 * @param mark - The mark
 * @param split - The channels that split it, by name
 * @returns The spec
 */
function specFor(mark: string, split: Record<string, unknown>): VegaLiteSpec {
  return {
    data: { values: ROWS },
    mark,
    encoding: {
      x: { field: 'x', type: mark === 'bar' ? 'ordinal' : 'quantitative' },
      y: { field: 'v', type: 'quantitative' },
      ...split,
    },
  } as unknown as VegaLiteSpec;
}

/**
 * The only layer a spec converts to.
 * @param spec - The spec
 * @returns The layer
 */
function onlyLayer(spec: VegaLiteSpec): MaidrLayer {
  const layers = vegaLiteToMaidr(spec).subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

const BY_MODEL = { field: 'model', type: 'nominal' };

describe('a vega-lite line split by strokeDash or stroke', () => {
  it.each(['strokeDash', 'stroke'])('reads one line per group for %s', (channel) => {
    const layer = onlyLayer(specFor('line', { [channel]: BY_MODEL }));

    // Before the fix: one series of six points, zigzagging between the two.
    expect(layer.type).toBe(TraceType.LINE);
    const series = layer.data as LinePoint[][];
    expect(series.map(points => points.map(point => point.z))).toEqual([
      ['Fast', 'Fast', 'Fast'],
      ['Slow', 'Slow', 'Slow'],
    ]);
    expect(series.map(points => points.map(point => point.y))).toEqual([[2, 4, 6], [1, 2, 3]]);
    expect(layer.selectors).toHaveLength(2);
  });

  it('names what the lines are split by with the legend\'s title', () => {
    const layer = onlyLayer(specFor('line', { strokeDash: { ...BY_MODEL, title: 'Model' } }));

    expect(layer.axes?.z).toEqual({ label: 'Model' });
  });

  it('names it with the field when the legend is untitled', () => {
    const layer = onlyLayer(specFor('line', { strokeDash: BY_MODEL }));

    expect(layer.axes?.z).toEqual({ label: 'model' });
  });

  it('keeps colour as the split when the chart is coloured by a field', () => {
    const rows = ROWS.map(row => ({ ...row, team: row.x === 1 ? 'Red' : 'Blue' }));
    const layer = onlyLayer({
      ...specFor('line', { color: { field: 'model', type: 'nominal' }, strokeDash: { field: 'team', type: 'nominal' } }),
      data: { values: rows },
    } as VegaLiteSpec);

    expect((layer.data as LinePoint[][]).map(points => points[0].z)).toEqual(['Fast', 'Slow']);
  });
});

describe('vega-lite bars and areas stacked by stroke', () => {
  it('reads bars stacked by stroke as a stacked bar', () => {
    const layer = onlyLayer(specFor('bar', { stroke: BY_MODEL }));

    // Before the fix: a plain bar chart of six bars.
    expect(layer.type).toBe(TraceType.STACKED);
    expect((layer.data as SegmentedPoint[][]).map(series => series.map(point => point.y))).toEqual([
      [2, 4, 6],
      [1, 2, 3],
    ]);
    expect(layer.axes?.z).toEqual({ label: 'model' });
  });

  it('reads an area split by stroke as a stacked area', () => {
    const layer = onlyLayer(specFor('area', { stroke: BY_MODEL }));

    // Before the fix: one area of six points.
    expect(layer.type).toBe(TraceType.STACKED_AREA);
    expect(layer.data as LinePoint[][]).toHaveLength(2);
  });
});

describe('a vega-lite point outlined by stroke', () => {
  it('is read as the scatter it is, its stroke an outline', () => {
    const layer = onlyLayer(specFor('point', { stroke: BY_MODEL }));

    expect(layer.type).toBe(TraceType.SCATTER);
    expect(layer.axes?.z).toBeUndefined();
  });
});

describe('vega-lite bars stacked by stroke, bound to the chart', () => {
  afterEach(() => {
    initMock.mockClear();
    document.body.innerHTML = '';
  });

  /**
   * A rendered chart: one rect per cell in the given order, every rect
   * filled alike and outlined in its group's colour.
   * @param cells - The cells, as Vega emits them
   * @returns The view reporting the container
   */
  function chart(cells: typeof ROWS): VegaView {
    const container = document.createElement('div');
    container.id = 'chart';
    const svg = document.createElementNS(SVG_NS, 'svg');
    const marks = document.createElementNS(SVG_NS, 'g');
    marks.setAttribute('class', 'mark-rect role-mark marks');
    for (const cell of cells) {
      const rect = document.createElementNS(SVG_NS, 'path');
      rect.setAttribute('fill', '#4c78a8');
      rect.setAttribute('stroke', cell.model === 'Fast' ? '#4c78a8' : '#f58518');
      marks.appendChild(rect);
    }
    svg.appendChild(marks);
    container.appendChild(svg);
    document.body.appendChild(container);
    return {
      container: () => container,
      data: (name: string) => {
        throw new Error(`no dataset ${name}`);
      },
      runAsync: async (): Promise<unknown> => undefined,
      scale: () => undefined,
    } as unknown as VegaView;
  }

  it('reads marks emitted a category at a time by their outlines', () => {
    bindVegaLite(chart(ROWS), specFor('bar', { stroke: BY_MODEL }));
    const layer = (initMock.mock.calls[0]?.[0] as Maidr).subplots[0][0].layers[0];

    // Every rect is filled alike, so the fill alone read the first two marks
    // as one series' and the emission as a series at a time.
    expect(layer.domMapping).toEqual({ order: 'column', groupDirection: 'forward' });
  });

  it('still reads marks emitted a series at a time', () => {
    const bySeries = [...ROWS.filter(row => row.model === 'Fast'), ...ROWS.filter(row => row.model === 'Slow')];

    bindVegaLite(chart(bySeries), specFor('bar', { stroke: BY_MODEL }));
    const layer = (initMock.mock.calls[0]?.[0] as Maidr).subplots[0][0].layers[0];

    expect(layer.domMapping).toEqual({ order: 'row' });
  });
});
