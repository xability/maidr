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
          subType: 'bar',
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

  it('does not read the chart again for a render that changed nothing', () => {
    const chart = fakeChart(tile(), [1, 2]);
    bindEChart(chart);

    chart.finish();
    chart.finish();

    expect(bound).toHaveLength(1);
  });

  it('reads the chart again when its data changes', () => {
    const chart = fakeChart(tile(), [1, 2]);
    bindEChart(chart);

    chart.setOption([1, 2, 3]);
    chart.finish();

    expect(bound).toHaveLength(2);
    const maidr = JSON.parse(bound[1].getAttribute('maidr-data') ?? '{}');
    expect(maidr.subplots[0][0].layers[0].data).toHaveLength(3);
  });

  it('reads the chart again when it is resized', () => {
    const chart = fakeChart(tile(), [1, 2]);
    bindEChart(chart);

    chart.width = 300;
    chart.finish();

    expect(bound).toHaveLength(2);
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

  it('unbinds everything when stopped', () => {
    const charts = new Map<HTMLElement, EChartsBindable>();
    tile().setAttribute('_echarts_instance_', 'ec_1');
    charts.set(tile(), fakeChart(tile(), [1]));
    const stop = bindAllECharts(library(charts));

    stop();

    expect(unbound).toEqual([tile().firstElementChild]);
  });
});
