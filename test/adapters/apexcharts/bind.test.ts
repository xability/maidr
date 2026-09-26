/**
 * @jest-environment jsdom
 */

import type { Maidr } from '@type/grammar';
import type { FakeChart } from './helpers';
import { bindApexCharts } from '@adapters/apexcharts';
import { afterAll, afterEach, describe, expect, it, jest } from '@jest/globals';
import { drawBars, fakeChart } from './helpers';

/**
 * The binding: wait for the chart to settle, write `maidr-data`, dispatch
 * `maidr:bindchart`, and hand the data over again whenever ApexCharts
 * re-creates the chart's nodes — in place, through `window.maidrLive`, once
 * MAIDR is mounted.
 */

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterEach(() => {
  document.body.innerHTML = '';
  warn.mockClear();
});

afterAll(() => {
  warn.mockRestore();
});

/**
 * A drawn bar chart.
 *
 * @param animationEnded - Whether its animation has finished
 * @returns The chart
 */
function barChart(animationEnded = true): FakeChart {
  return fakeChart({
    type: 'bar',
    series: [{ name: 'A', values: [1, 2] }],
    labels: ['a', 'b'],
    chartOptions: { animations: { enabled: true, speed: 100 } },
    globals: { animationEnded },
    draw: dom => drawBars(dom.series(0), [1, 2], 0),
  });
}

/**
 * Collects the `maidr:bindchart` events dispatched from the document down.
 *
 * @returns The events' details, as they arrive
 */
function collectBinds(): Maidr[] {
  const seen: Maidr[] = [];
  document.addEventListener('maidr:bindchart', (event) => {
    seen.push((event as CustomEvent<Maidr>).detail);
  });
  return seen;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

describe('bindApexCharts', () => {
  it('should write maidr-data on the container and dispatch maidr:bindchart', async () => {
    const binds = collectBinds();
    const chart = barChart();

    const binding = bindApexCharts(chart, { title: 'Sales' });
    const maidr = await binding.ready;

    expect(maidr.title).toBe('Sales');
    expect(JSON.parse(chart.el.getAttribute('maidr-data') ?? '{}')).toEqual(JSON.parse(JSON.stringify(maidr)));
    expect(binds).toHaveLength(1);
    binding.dispose();
  });

  it('should mark the bound data live, so MAIDR applies a redraw while the reader is in the chart', async () => {
    const chart = barChart();

    const binding = bindApexCharts(chart);
    const maidr = await binding.ready;

    expect(maidr.live).toBe(true);
    binding.dispose();
  });

  it('should hand a redraw to the mounted instance in place rather than mount it again', async () => {
    const binds = collectBinds();
    const chart = barChart();
    const setData = jest.fn((_maidr: Maidr) => true);
    const global = globalThis as { maidrLive?: unknown };
    global.maidrLive = { setData };
    try {
      const binding = bindApexCharts(chart);
      const first = await binding.ready;
      // What maidr.js does on maidr:bindchart: wrap the container in a figure.
      const figure = document.createElement('figure');
      figure.id = `maidr-figure-${first.id}`;
      chart.el.replaceWith(figure);
      figure.appendChild(chart.el);

      chart.fire('updated');
      await sleep(400);

      expect(binds).toHaveLength(1);
      expect(setData).toHaveBeenCalledTimes(1);
      expect(setData.mock.calls[0][0]).toMatchObject({ id: first.id, live: true });
      binding.dispose();
    } finally {
      delete global.maidrLive;
    }
  });

  it('should mount again when the in-place update is refused', async () => {
    const binds = collectBinds();
    const chart = barChart();
    const global = globalThis as { maidrLive?: unknown };
    global.maidrLive = { setData: () => false };
    try {
      const binding = bindApexCharts(chart);
      const first = await binding.ready;
      const figure = document.createElement('figure');
      figure.id = `maidr-figure-${first.id}`;
      chart.el.replaceWith(figure);
      figure.appendChild(chart.el);

      chart.fire('updated');
      await sleep(400);

      expect(binds).toHaveLength(2);
      binding.dispose();
    } finally {
      delete global.maidrLive;
    }
  });

  it('should wait for the entry animation to end', async () => {
    const binds = collectBinds();
    const chart = barChart(false);

    const binding = bindApexCharts(chart);
    await sleep(200);
    const before = binds.length;
    chart.w.globals.animationEnded = true;
    await binding.ready;

    expect(before).toBe(0);
    expect(binds).toHaveLength(1);
    binding.dispose();
  });

  it('should bind again, once, after a burst of updates', async () => {
    const binds = collectBinds();
    const chart = barChart();
    const binding = bindApexCharts(chart);
    await binding.ready;

    chart.fire('updated');
    chart.fire('updated');
    await sleep(400);

    expect(binds).toHaveLength(2);
    binding.dispose();
  });

  it('should bind a chart that keeps updating at least once per animation budget', async () => {
    // ApexCharts' realtime demo calls updateSeries() every second with a
    // one-second update animation, so a new update always arrived before
    // the last one had settled, and each cancelled the wait for the one
    // before: MAIDR kept reading the first data for as long as it streamed.
    const binds = collectBinds();
    const chart = barChart();
    const binding = bindApexCharts(chart);
    await binding.ready;

    // Budget: 1000 + 2 x 100 (speed) + 350 (dynamic speed) = 1550 ms.
    // Updates every 60 ms never leave the 120 ms quiet period.
    const stream = setInterval(() => chart.fire('updated'), 60);
    await sleep(2200);
    const during = binds.length;
    clearInterval(stream);
    binding.dispose();

    expect(during).toBeGreaterThanOrEqual(2);
  });

  it('should wait for a chart that has not been drawn to be mounted', async () => {
    const binds = collectBinds();
    const chart = fakeChart({ type: 'bar', series: [{ name: 'A', values: [1] }], labels: ['a'] });
    chart.w.config.chart.animations = { enabled: false, speed: 0, dynamicAnimation: { enabled: false } };

    const binding = bindApexCharts(chart);
    await sleep(1700);
    const before = binds.length;
    const wrap = document.createElement('div');
    wrap.className = 'apexcharts-canvas';
    wrap.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    chart.el.appendChild(wrap);
    chart.fire('mounted');
    await binding.ready;

    expect(before).toBe(0);
    // A page awaiting `ready` on a chart it never rendered is told why.
    expect(warn.mock.calls.map(call => String(call[0])).join('\n')).toContain('has not been drawn');
    expect(binds).toHaveLength(1);
    binding.dispose();
  });

  it('should reject ready when disposed before the chart was bound', async () => {
    const binds = collectBinds();
    const chart = barChart(false);

    const binding = bindApexCharts(chart);
    binding.dispose();

    await expect(binding.ready).rejects.toThrow('disposed');
    expect(binds).toHaveLength(0);
  });

  it('should have ApexCharts redraw at the width it sets on the container', async () => {
    // ApexCharts watches the container's parent at render() time for size
    // changes, and MAIDR has moved the container out of it, so a width set
    // on the container was never drawn: the svg stayed at its first width
    // and the page scrolled sideways.
    const chart = barChart();
    const parentResized = jest.fn();
    chart.parentResizeHandler = parentResized;
    const global = globalThis as { maidrLive?: unknown; ResizeObserver?: unknown };
    global.maidrLive = { setData: () => true };
    global.ResizeObserver = class {
      observe(): void {}
      disconnect(): void {}
    };
    try {
      const binding = bindApexCharts(chart);
      const first = await binding.ready;
      const figure = document.createElement('figure');
      figure.id = `maidr-figure-${first.id}`;
      Object.defineProperty(figure, 'clientWidth', { value: 604 });
      chart.el.replaceWith(figure);
      figure.appendChild(chart.el);

      chart.fire('updated');
      await sleep(400);

      expect((chart.el as HTMLElement).style.width).toBe('604px');
      expect(parentResized).toHaveBeenCalled();
      binding.dispose();
      expect((chart.el as HTMLElement).style.width).toBe('');
    } finally {
      delete global.maidrLive;
      delete global.ResizeObserver;
    }
  });

  it('should stop following the chart once disposed', async () => {
    const binds = collectBinds();
    const chart = barChart();
    const binding = bindApexCharts(chart);
    await binding.ready;

    binding.dispose();
    chart.fire('updated');
    await sleep(300);

    expect(binds).toHaveLength(1);
    expect(chart.handlers.get('updated')).toEqual([]);
    expect(chart.handlers.get('mounted')).toEqual([]);
  });

  it('should reject ready and log when the chart cannot be converted', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const chart = barChart();
    chart.w.config.series = null as unknown as [];

    const binding = bindApexCharts(chart);

    await expect(binding.ready).rejects.toBeInstanceOf(Error);
    expect(String(error.mock.calls[0][0])).toContain('[maidr/apexcharts]');
    binding.dispose();
    error.mockRestore();
  });
});
