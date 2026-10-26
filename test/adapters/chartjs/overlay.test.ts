/**
 * @jest-environment jsdom
 */

import type { ChartJsMetaElement } from '@adapters/chartjs/types';
import { elementToOverlayShape, HighlightOverlay } from '@adapters/chartjs/overlay';

/**
 * Chart.js element instances carry far more geometry than the minimal
 * `ChartJsMetaElement` interface declares, and that extra geometry is exactly
 * what the shape detection reads — so build them loosely.
 */
function element(props: Record<string, unknown>): ChartJsMetaElement {
  return props as unknown as ChartJsMetaElement;
}

/** A mounted overlay plus the host to query the drawn nodes from. */
function mount(): { host: HTMLElement; overlay: HighlightOverlay } {
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  document.body.appendChild(host);

  return { host, overlay: new HighlightOverlay(host, canvas) };
}

/** A quarter slice of a 50px circle centred at (100, 100), starting at 3 o'clock. */
const quarterSlice = {
  kind: 'wedge',
  x: 100,
  y: 100,
  innerRadius: 0,
  outerRadius: 50,
  startAngle: 0,
  endAngle: Math.PI / 2,
} as const;

describe('chart.js highlight overlay', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('elementToOverlayShape', () => {
    it('reads a pie slice as a wedge rather than a box', () => {
      const shape = elementToOverlayShape(element({
        x: 100,
        y: 100,
        innerRadius: 0,
        outerRadius: 50,
        startAngle: 0,
        endAngle: Math.PI / 2,
      }));

      expect(shape).toEqual(quarterSlice);
    });

    it('carries a doughnut cutout through as the inner radius', () => {
      const shape = elementToOverlayShape(element({
        x: 100,
        y: 100,
        innerRadius: 20,
        outerRadius: 50,
        startAngle: 0,
        endAngle: Math.PI / 2,
      }));

      expect(shape).toEqual({ ...quarterSlice, innerRadius: 20 });
    });

    it('still reads a bar element as a rect', () => {
      const shape = elementToOverlayShape(element({
        x: 50,
        y: 20,
        base: 120,
        width: 30,
        height: 100,
      }));

      expect(shape).toEqual({ kind: 'rect', left: 35, top: 20, width: 30, height: 100 });
    });

    // The boxplot plugin's elements as its controller leaves them: Chart.js's
    // bar geometry, with `y` at the median and `base` at the zero line, plus
    // the summary in pixels. The scale draws value v at pixel 400 - 5v.
    it('outlines a box plot\'s box, whiskers and outliers, not a bar up to its median', () => {
      const shape = elementToOverlayShape(element({
        x: 384,
        y: 190,
        base: 400,
        width: 156,
        height: 210,
        median: 190,
        q1: 250,
        q3: 140,
        whiskerMin: 300,
        whiskerMax: 75,
        min: 300,
        max: 75,
        outliers: [340, 40],
      }));

      // From the upper outlier (72) down to the lower one (12).
      expect(shape).toEqual({ kind: 'rect', left: 306, top: 40, width: 156, height: 300 });
    });

    it('outlines a sideways box plot along the value axis', () => {
      // `indexAxis: 'y'`: the value runs across, at pixel 100 + 5v, and
      // `height` is the box's thickness.
      const shape = elementToOverlayShape(element({
        x: 250,
        y: 200,
        base: 100,
        width: 150,
        height: 68,
        horizontal: true,
        median: 250,
        q1: 210,
        q3: 300,
        whiskerMin: 150,
        whiskerMax: 350,
        outliers: [],
      }));

      expect(shape).toEqual({ kind: 'rect', left: 150, top: 166, width: 200, height: 68 });
    });

    it('outlines a violin from one end of its curve to the other', () => {
      const shape = elementToOverlayShape(element({
        x: 100,
        y: 200,
        base: 400,
        width: 40,
        height: 200,
        median: 200,
        q1: 240,
        q3: 160,
        min: 300,
        max: 80,
        outliers: [],
        coords: [{ v: 300, estimate: 0.1 }, { v: 200, estimate: 0.4 }, { v: 80, estimate: 0.1 }],
      }));

      expect(shape).toEqual({ kind: 'rect', left: 80, top: 80, width: 40, height: 220 });
    });
  });

  describe('drawing', () => {
    it('draws a slice as an svg wedge path, not a div', () => {
      const { host, overlay } = mount();

      overlay.show([quarterSlice]);

      // A quarter turn clockwise from 3 o'clock — (150,100) round to (100,150)
      // — then straight back to the centre. A box would instead cover the
      // three slices around it.
      const path = host.querySelector('svg[data-maidr-chartjs-highlight] path');
      expect(path?.getAttribute('d')).toBe('M 150 100 A 50 50 0 0 1 100 150 L 100 100 Z');
      expect(host.querySelector('div[data-maidr-chartjs-highlight]')).toBeNull();
    });

    it('closes a doughnut wedge along its inner arc', () => {
      const { host, overlay } = mount();

      overlay.show([{ ...quarterSlice, innerRadius: 20 }]);

      const path = host.querySelector('svg[data-maidr-chartjs-highlight] path');
      expect(path?.getAttribute('d')).toBe(
        'M 150 100 A 50 50 0 0 1 100 150 L 100 120 A 20 20 0 0 0 120 100 Z',
      );
    });

    it('keeps a whole-circle slice visible instead of collapsing it', () => {
      const { host, overlay } = mount();

      overlay.show([{ ...quarterSlice, endAngle: Math.PI * 2 }]);

      // An arc whose endpoints coincide draws nothing, so the sweep stops just
      // short of 360° — the endpoint must differ from the start point.
      const path = host.querySelector('svg[data-maidr-chartjs-highlight] path');
      expect(path?.getAttribute('d')).toBe('M 150 100 A 50 50 0 1 1 150 99.95 L 100 100 Z');
    });

    it('draws a rect element as a positioned div', () => {
      const { host, overlay } = mount();

      overlay.show([{ kind: 'rect', left: 10, top: 20, width: 30, height: 40 }]);

      const node = host.querySelector<HTMLDivElement>('div[data-maidr-chartjs-highlight]');
      expect(node?.style.left).toBe('10px');
      expect(node?.style.width).toBe('30px');
    });

    it('replaces the previous highlight on every show', () => {
      const { host, overlay } = mount();

      overlay.show([quarterSlice]);
      overlay.show([{ ...quarterSlice, startAngle: Math.PI / 2, endAngle: Math.PI }]);

      expect(host.querySelectorAll('[data-maidr-chartjs-highlight]')).toHaveLength(1);
    });
  });

  describe('captureClean', () => {
    it('keeps no copy of the chart while nothing reads its pixels', () => {
      // A full-canvas copy on every frame is a cost every Chart.js chart
      // would pay for a display few readers have.
      const { host, overlay } = mount();

      overlay.captureClean();

      expect(host.querySelector('[data-maidr-clean-canvas]')).toBeNull();
    });

    it('repaints the chart as a reader of the pixels arrives', async () => {
      // With no copy yet, the first reading would find the tooltip among the
      // marks until the chart next drew of its own accord.
      const host = document.createElement('div');
      const canvas = document.createElement('canvas');
      host.appendChild(canvas);
      document.body.appendChild(host);
      const repaint = jest.fn();
      const overlay = new HighlightOverlay(host, canvas, undefined, repaint);
      const layer = host.querySelector('[data-maidr-overlay]') as HTMLElement;

      layer.setAttribute('data-maidr-pixel-reader', '');
      await Promise.resolve();

      expect(repaint).toHaveBeenCalledTimes(1);
      overlay.dispose();
    });

    it('keeps a copy while a reader of the pixels asks for one, and drops it after', () => {
      const { host, overlay } = mount();
      const canvas = host.querySelector('canvas') as HTMLCanvasElement;
      canvas.width = 10;
      canvas.height = 10;
      const layer = host.querySelector('[data-maidr-overlay]') as HTMLElement;

      layer.setAttribute('data-maidr-pixel-reader', '');
      overlay.captureClean();
      const kept = host.querySelector('[data-maidr-clean-canvas]');
      layer.removeAttribute('data-maidr-pixel-reader');
      overlay.captureClean();

      expect(kept).not.toBeNull();
      // A copy left behind would be out of date by the next reading.
      expect(host.querySelector('[data-maidr-clean-canvas]')).toBeNull();
    });
  });
});
