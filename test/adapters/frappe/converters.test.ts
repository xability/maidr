import type { FrappeChart, FrappePanel } from '@adapters/frappe/types';
import type { BarPoint, MaidrLayer } from '@type/grammar';
import { createMaidrFromFrappeChart, createMaidrFromFrappeCharts } from '@adapters/frappe/converters';
import { TraceType } from '@type/grammar';
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. Tests only use the public Element/JSDOM surface.
import { JSDOM } from 'jsdom';

/** A minimal chart stub — the adapter only reads `chart.data`. */
function makeChart(values: number[] = [10, 20, 30], name = 'Series'): FrappeChart {
  return {
    data: {
      labels: ['A', 'B', 'C'].slice(0, values.length),
      datasets: [{ name, values }],
    },
  };
}

/** Builds a wrapper element containing `count` panel containers. */
function makeDom(count: number): { wrapper: HTMLElement; containers: HTMLElement[] } {
  const dom = new JSDOM('<!doctype html><html><body><div id="wrapper"></div></body></html>');
  const document = dom.window.document;
  const wrapper = document.getElementById('wrapper') as HTMLElement;
  const containers: HTMLElement[] = [];
  for (let i = 0; i < count; i += 1) {
    const container = document.createElement('div');
    wrapper.appendChild(container);
    containers.push(container);
  }
  return { wrapper, containers };
}

function panel(container: HTMLElement, title?: string, values?: number[]): FrappePanel {
  return {
    chart: makeChart(values),
    container,
    chartType: 'bar',
    ...(title ? { title } : {}),
  };
}

describe('createMaidrFromFrappeChart (single chart)', () => {
  it('produces an unchanged 1x1 figure without a subplot selector or layer title', () => {
    const { containers } = makeDom(1);
    const container = containers[0];
    container.id = 'chart';

    const maidr = createMaidrFromFrappeChart(makeChart(), container, {
      chartType: 'bar',
      title: 'My Chart',
      axes: { x: 'Category', y: 'Value' },
    });

    expect(maidr.id).toBe('chart');
    expect(maidr.title).toBe('My Chart');
    expect(maidr.subplots).toHaveLength(1);
    expect(maidr.subplots[0]).toHaveLength(1);

    const subplot = maidr.subplots[0][0];
    expect(subplot.selector).toBeUndefined();
    expect(subplot.layers).toHaveLength(1);

    const layer = subplot.layers[0];
    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.title).toBeUndefined();
    expect(layer.selectors).toBe('#chart svg.frappe-chart .dataset-units.dataset-bars.dataset-0 rect.bar');
    expect(layer.axes).toEqual({ x: { label: 'Category' }, y: { label: 'Value' } });
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'A', y: 10 },
      { x: 'B', y: 20 },
      { x: 'C', y: 30 },
    ]);
  });

  it('generates a container id when missing and uses it as the figure id', () => {
    const { containers } = makeDom(1);
    const container = containers[0];

    const maidr = createMaidrFromFrappeChart(makeChart(), container, { chartType: 'bar' });

    expect(container.id).not.toBe('');
    expect(maidr.id).toBe(container.id);
    expect(maidr.subplots[0][0].layers[0].selectors)
      .toBe(`#${container.id} svg.frappe-chart .dataset-units.dataset-bars.dataset-0 rect.bar`);
  });
});

describe('createMaidrFromFrappeCharts (multi-panel)', () => {
  it('maps a 2D panel grid 1:1 to subplots, allowing ragged rows', () => {
    const { wrapper, containers } = makeDom(3);

    const maidr = createMaidrFromFrappeCharts(
      [
        [panel(containers[0], 'North'), panel(containers[1], 'South')],
        [panel(containers[2], 'East')],
      ],
      wrapper,
    );

    expect(maidr.subplots).toHaveLength(2);
    expect(maidr.subplots[0]).toHaveLength(2);
    expect(maidr.subplots[1]).toHaveLength(1);
  });

  it('places a flat panel array in a single row when columns is omitted', () => {
    const { wrapper, containers } = makeDom(3);

    const maidr = createMaidrFromFrappeCharts(containers.map(c => panel(c)), wrapper);

    expect(maidr.subplots).toHaveLength(1);
    expect(maidr.subplots[0]).toHaveLength(3);
  });

  it('chunks a flat panel array into rows of `columns` panels (row-major)', () => {
    const { wrapper, containers } = makeDom(3);

    const maidr = createMaidrFromFrappeCharts(
      [panel(containers[0], 'A'), panel(containers[1], 'B'), panel(containers[2], 'C')],
      wrapper,
      { columns: 2 },
    );

    expect(maidr.subplots).toHaveLength(2);
    expect(maidr.subplots[0]).toHaveLength(2);
    expect(maidr.subplots[1]).toHaveLength(1);
    expect(maidr.subplots[0][0].layers[0].title).toBe('A');
    expect(maidr.subplots[0][1].layers[0].title).toBe('B');
    expect(maidr.subplots[1][0].layers[0].title).toBe('C');
  });

  it('scopes each panel\'s layer selectors and subplot selector to its own container id', () => {
    const { wrapper, containers } = makeDom(2);

    const maidr = createMaidrFromFrappeCharts(
      [[panel(containers[0]), panel(containers[1])]],
      wrapper,
    );

    const [first, second] = maidr.subplots[0];
    const firstId = containers[0].id;
    const secondId = containers[1].id;

    expect(firstId).not.toBe('');
    expect(secondId).not.toBe('');
    expect(firstId).not.toBe(secondId);

    expect(first.selector).toBe(`#${firstId} svg.frappe-chart`);
    expect(second.selector).toBe(`#${secondId} svg.frappe-chart`);
    expect(first.layers[0].selectors)
      .toBe(`#${firstId} svg.frappe-chart .dataset-units.dataset-bars.dataset-0 rect.bar`);
    expect(second.layers[0].selectors)
      .toBe(`#${secondId} svg.frappe-chart .dataset-units.dataset-bars.dataset-0 rect.bar`);
  });

  it('puts the panel title on the first layer only', () => {
    const { wrapper, containers } = makeDom(1);
    const mixed: FrappePanel = {
      chart: {
        data: {
          labels: ['A', 'B'],
          datasets: [
            { name: 'Sales', chartType: 'bar', values: [1, 2] },
            { name: 'Trend', chartType: 'line', values: [3, 4] },
          ],
        },
      },
      container: containers[0],
      chartType: 'axis-mixed',
      title: 'Store One',
    };

    const maidr = createMaidrFromFrappeCharts([[mixed]], wrapper);
    const layers = maidr.subplots[0][0].layers;

    expect(layers).toHaveLength(2);
    expect(layers[0].title).toBe('Store One');
    expect(layers[1].title).toBe('Trend');
  });

  it('assigns figure-unique layer ids across all panels', () => {
    const { wrapper, containers } = makeDom(4);

    const maidr = createMaidrFromFrappeCharts(
      [
        [panel(containers[0]), panel(containers[1])],
        [panel(containers[2]), panel(containers[3])],
      ],
      wrapper,
    );

    const ids = maidr.subplots
      .flat()
      .flatMap(subplot => subplot.layers.map((layer: MaidrLayer) => layer.id));
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses the wrapper id as the figure id, generating one when missing', () => {
    const { wrapper, containers } = makeDom(1);
    wrapper.removeAttribute('id');

    const maidr = createMaidrFromFrappeCharts([[panel(containers[0])]], wrapper);

    expect(wrapper.id).not.toBe('');
    expect(maidr.id).toBe(wrapper.id);
  });

  it('honors figure-level options', () => {
    const { wrapper, containers } = makeDom(1);

    const maidr = createMaidrFromFrappeCharts([[panel(containers[0])]], wrapper, {
      id: 'dashboard',
      title: 'Dashboard',
      subtitle: 'Q1',
      caption: 'Source: internal',
    });

    expect(maidr.id).toBe('dashboard');
    expect(maidr.title).toBe('Dashboard');
    expect(maidr.subtitle).toBe('Q1');
    expect(maidr.caption).toBe('Source: internal');
  });

  it('emits a per-panel legend for multi-line panels', () => {
    const { wrapper, containers } = makeDom(1);
    const multiLine: FrappePanel = {
      chart: {
        data: {
          labels: ['A', 'B'],
          datasets: [
            { name: 'One', values: [1, 2] },
            { name: 'Two', values: [3, 4] },
          ],
        },
      },
      container: containers[0],
      chartType: 'line',
      title: 'Lines',
    };

    const maidr = createMaidrFromFrappeCharts([[multiLine]], wrapper);

    expect(maidr.subplots[0][0].legend).toEqual(['One', 'Two']);
  });

  it('throws for an empty panel grid', () => {
    const { wrapper } = makeDom(0);

    expect(() => createMaidrFromFrappeCharts([], wrapper)).toThrow('at least one panel');
  });

  it('throws for an empty row in a 2D grid', () => {
    const { wrapper, containers } = makeDom(1);

    expect(() => createMaidrFromFrappeCharts([[panel(containers[0])], []], wrapper))
      .toThrow('row 1 is empty');
  });

  it('throws for a non-positive or fractional columns value', () => {
    const { wrapper, containers } = makeDom(1);

    expect(() => createMaidrFromFrappeCharts([panel(containers[0])], wrapper, { columns: 0 }))
      .toThrow('columns');
    expect(() => createMaidrFromFrappeCharts([panel(containers[0])], wrapper, { columns: 1.5 }))
      .toThrow('columns');
  });

  it('throws when a panel container is not a descendant of the wrapper', () => {
    const { wrapper, containers } = makeDom(1);
    const outside = wrapper.ownerDocument.createElement('div');
    wrapper.ownerDocument.body.appendChild(outside);

    expect(() =>
      createMaidrFromFrappeCharts([[panel(containers[0]), panel(outside)]], wrapper),
    ).toThrow('descendant of the wrapper');
  });

  it('throws when a panel container is the wrapper itself', () => {
    const { wrapper } = makeDom(0);

    expect(() => createMaidrFromFrappeCharts([[panel(wrapper)]], wrapper))
      .toThrow('descendant of the wrapper');
  });
});
