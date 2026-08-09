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
function element(props: Record<string, number | boolean>): ChartJsMetaElement {
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
});
