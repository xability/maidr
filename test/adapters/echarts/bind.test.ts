/**
 * @jest-environment jsdom
 */

/**
 * Keeping a reading bound to a chart that changes (#1304).
 *
 * Superset and Metabase call `setOption` again on every new query result and
 * `resize` on every dashboard layout, and dispose a chart whose tile goes
 * away. Measured on both, every one of those ends in a `finished` event --
 * and so does a mouse crossing the chart, which Metabase's pie fired fifteen
 * times for in one pass. So the binding reads the chart again only when its
 * option or its size changed, and a reader is not reset by a hover.
 */

import type { EChartsBindable, EChartsLibrary } from '@adapters/echarts/bind';
import { bindAllECharts, bindEChart } from '@adapters/echarts/bind';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

interface FakeChart extends EChartsBindable {
  /** Fires the chart's `finished` event, as a render would. */
  finish: () => void;
  /** What `getOption()` answers. */
  option: { values: number[] };
  width: number;
  /** The series type the model reports. */
  subType: string;
  /** Draws the chart again from new values, as ECharts' own does. */
  setOption: (next: number[]) => void;
}

/**
 * A chart drawn as SVG into `host`, one filled mark per value.
 *
 * @param host   - The element `echarts.init` was given
 * @param values - The bar values
 * @returns The fake instance
 */
function fakeChart(host: HTMLElement, values: number[]): FakeChart {
  const handlers = new Set<() => void>();
  const chart: FakeChart = {
    option: { values },
    width: 600,
    subType: 'bar',
    finish: () => handlers.forEach(handler => handler()),
    on: (_, handler) => handlers.add(handler),
    off: (_, handler) => handlers.delete(handler),
    getOption: () => chart.option,
    getWidth: () => chart.width,
    getHeight: () => 400,
    getDom: () => host,
    setOption: (next) => {
      chart.option = { values: next };
      host.innerHTML = `<div style="position: relative"><svg>${
        next.map(() => '<path fill="#5070dd"></path>').join('')
      }</svg></div>`;
    },
    getModel: () => ({
      eachSeries: (callback) => {
        callback({
          subType: chart.subType,
          name: 'series\u00000',
          get: () => undefined,
          getData: () => ({
            dimensions: ['x', 'y'],
            count: () => chart.option.values.length,
            getName: index => `c${index}`,
            get: (dimension, index) => (dimension === 'y' ? chart.option.values[index] : index),
          }),
        }, 0);
      },
      eachComponent: (query, callback) => {
        if (query.mainType === 'xAxis') {
          callback({ get: key => (key === 'type' ? 'category' : undefined) }, 0);
        }
      },
    }),
  };
  chart.setOption(values);
  return chart;
}

const bound: Element[] = [];
const unbound: Element[] = [];
function onBind(event: Event): void {
  bound.push(event.target as Element);
}
function onUnbind(event: Event): void {
  unbound.push((event as CustomEvent<Element>).detail);
}

beforeEach(() => {
  document.body.innerHTML = '<div id="tile"></div>';
  bound.length = 0;
  unbound.length = 0;
  document.addEventListener('maidr:bindchart', onBind);
  document.addEventListener('maidr:unbindchart', onUnbind);
});

afterEach(() => {
  document.removeEventListener('maidr:bindchart', onBind);
  document.removeEventListener('maidr:unbindchart', onUnbind);
});

function tile(): HTMLElement {
  return document.getElementById('tile') as HTMLElement;
}

describe('bindEChart', () => {
  it('binds MAIDR to the element ECharts drew into, not the host\'s', () => {
    // The host's element belongs to React in both tools, and MAIDR moves the
    // element it is mounted on into a wrapper.
    const chart = fakeChart(tile(), [1, 2]);

    bindEChart(chart);

    expect(bound).toEqual([tile().firstElementChild]);
    const maidr = JSON.parse(bound[0].getAttribute('maidr-data') ?? '{}');
    expect(maidr.subplots[0][0].layers[0].data).toEqual([
      { x: 'c0', y: 1 },
      { x: 'c1', y: 2 },
    ]);
  });

  it('does not mount the chart again for renders that changed nothing', () => {
    // Every hover ends in a `finished`, and so does an entrance animation a
    // reader may already have tabbed into.
    const chart = fakeChart(tile(), [1, 2]);
    bindEChart(chart);

    chart.finish();
    chart.finish();
    chart.finish();

    expect(bound).toHaveLength(1);
  });

  it('mounts the reading taken once the chart has finished, when it differs', () => {
    // A large series is drawn a few hundred points a frame, so the reading
    // taken at bind time may have found only some of its marks.
    const chart = fakeChart(tile(), [1, 2]);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    tile().querySelector('path')?.remove();
    bindEChart(chart);
    warn.mockRestore();
    expect(JSON.parse(bound[0].getAttribute('maidr-data') ?? '{}').subplots[0][0].layers[0].selectors)
      .toBeUndefined();

    tile().querySelector('svg')?.insertAdjacentHTML('afterbegin', '<path fill="#5070dd"></path>');
    chart.finish();

    expect(bound).toHaveLength(2);
    expect(JSON.parse(bound[1].getAttribute('maidr-data') ?? '{}').subplots[0][0].layers[0].selectors)
      .toHaveLength(2);
  });

  it('mounts the chart again when its data changes', () => {
    const chart = fakeChart(tile(), [1, 2]);
    bindEChart(chart);
    chart.finish();

    chart.setOption([1, 2, 3]);
    chart.finish();

    expect(bound).toHaveLength(2);
    const maidr = JSON.parse(bound[1].getAttribute('maidr-data') ?? '{}');
    expect(maidr.subplots[0][0].layers[0].data).toHaveLength(3);
  });

  it('mounts the chart again when a resize redraws its marks', () => {
    // A canvas chart's overlay is drawn anew at the new size, and a mounted
    // instance holds the elements it resolved.
    const chart = fakeChart(tile(), [1, 2]);
    bindEChart(chart);
    chart.finish();

    chart.width = 300;
    chart.setOption([1, 2]);
    chart.finish();

    expect(bound).toHaveLength(2);
  });

  it('unbinds a chart that can no longer be read, and warns about it once', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = fakeChart(tile(), [1, 2]);
    bindEChart(chart);
    chart.finish();
    const target = bound[0];

    // A series the adapter does not read, as a `custom` series would be.
    chart.subType = 'custom';
    chart.setOption([3]);
    chart.finish();
    chart.finish();

    expect(unbound).toEqual([target]);
    expect(target.hasAttribute('maidr-data')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('waits for a chart that has not drawn yet', () => {
    const chart = fakeChart(tile(), [1]);
    tile().innerHTML = '';

    bindEChart(chart);
    expect(bound).toHaveLength(0);

    chart.setOption([1]);
    chart.finish();
    expect(bound).toHaveLength(1);
  });

  it('does not count MAIDR\'s own elements among the marks when read again', () => {
    // A reader focused on the chart leaves highlight clones in the drawing,
    // copied with the stamp; a refresh read then while they were there
    // counted them and lost the chart its highlighting.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = fakeChart(tile(), [1, 2]);
    bindEChart(chart);
    const svg = tile().querySelector('svg') as SVGSVGElement;
    const clone = svg.firstElementChild?.cloneNode(true) as Element;
    clone.setAttribute('data-maidr-owned', 'true');
    svg.appendChild(clone);

    chart.finish();

    // Counted, the clone would have cost the reading its selectors, and the
    // reading without them would have been mounted in place of this one.
    expect(warn).not.toHaveBeenCalled();
    expect(bound).toHaveLength(1);
    warn.mockRestore();
  });

  it('stops listening and tears MAIDR down when unbound', () => {
    const chart = fakeChart(tile(), [1, 2]);
    const unbind = bindEChart(chart);
    const target = bound[0];

    unbind();
    chart.width = 300;
    chart.finish();

    expect(unbound).toEqual([target]);
    expect(bound).toHaveLength(1);
    expect(target.hasAttribute('maidr-data')).toBe(false);
  });
});

describe('bindAllECharts', () => {
  const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

  function library(charts: Map<HTMLElement, EChartsBindable>): EChartsLibrary {
    return { getInstanceByDom: dom => charts.get(dom) };
  }

  it('binds every chart on the page, and those drawn later', async () => {
    const charts = new Map<HTMLElement, EChartsBindable>();
    tile().setAttribute('_echarts_instance_', 'ec_1');
    charts.set(tile(), fakeChart(tile(), [1]));

    const stop = bindAllECharts(library(charts));
    expect(bound).toEqual([tile().firstElementChild]);

    const later = document.createElement('div');
    later.setAttribute('_echarts_instance_', 'ec_2');
    charts.set(later, fakeChart(later, [2]));
    document.body.appendChild(later);
    await frame();

    expect(bound).toEqual([tile().firstElementChild, later.firstElementChild]);
    stop();
  });

  it('unbinds a chart whose tile is removed', async () => {
    const charts = new Map<HTMLElement, EChartsBindable>();
    tile().setAttribute('_echarts_instance_', 'ec_1');
    charts.set(tile(), fakeChart(tile(), [1]));
    const stop = bindAllECharts(library(charts));
    const target = bound[0];

    tile().remove();
    await frame();

    expect(unbound).toEqual([target]);
    stop();
  });

  it('binds a chart created again on the same element', async () => {
    // echarts-for-react disposes and re-creates a chart on a theme change,
    // and React's StrictMode does it on every mount in development.
    const charts = new Map<HTMLElement, EChartsBindable>();
    tile().setAttribute('_echarts_instance_', 'ec_1');
    charts.set(tile(), fakeChart(tile(), [1]));
    const stop = bindAllECharts(library(charts));
    const first = bound[0];

    charts.set(tile(), fakeChart(tile(), [1, 2]));
    tile().setAttribute('_echarts_instance_', 'ec_2');
    await frame();

    expect(unbound).toEqual([first]);
    expect(bound).toHaveLength(2);
    const maidr = JSON.parse(bound[1].getAttribute('maidr-data') ?? '{}');
    expect(maidr.subplots[0][0].layers[0].data).toHaveLength(2);
    stop();
  });

  it('unbinds everything when stopped', () => {
    const charts = new Map<HTMLElement, EChartsBindable>();
    tile().setAttribute('_echarts_instance_', 'ec_1');
    charts.set(tile(), fakeChart(tile(), [1]));
    const stop = bindAllECharts(library(charts));

    stop();

    expect(unbound).toEqual([tile().firstElementChild]);
  });
});
