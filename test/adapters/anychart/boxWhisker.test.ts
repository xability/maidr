/**
 * The whisker stems of an AnyChart box plot.
 *
 * AnyChart draws each box as four paths in one layer: the filled body, the
 * median, one path holding both stems (`M x min L x q1 M x q3 L x max`), and
 * one holding both caps, which at its default whisker width of zero are points.
 * The paths below are the last two boxes of `examples/anychart/box.html` as
 * Chromium drew them. Set E's minimum is 834 against a first quartile of 836,
 * so its lower stem is 1.2 px long.
 *
 * jsdom lays nothing out, so `getBBox` is computed from each path's own
 * coordinates and the fill is read from its attributes, as a browser would.
 */

import type { AnyChartInstance, AnyChartSeries } from '@adapters/anychart/types';
import { bindAnyChart } from '@adapters/anychart/converters';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  document: dom.window.document,
  window: dom.window,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  Node: dom.window.Node,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
  // The stamper pads a stroke's box into a new `DOMRect`.
  DOMRect: dom.window.DOMRect,
});

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The box of every point a path's `d` names. */
function boxOfPath(this: Element): DOMRect {
  const numbers = (this.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const xs = numbers.filter((_, i) => i % 2 === 0);
  const ys = numbers.filter((_, i) => i % 2 === 1);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y } as DOMRect;
}

beforeAll(() => {
  Object.defineProperty(dom.window.SVGElement.prototype, 'getBBox', {
    value: boxOfPath,
    configurable: true,
  });
});
afterAll(() => {
  delete (dom.window.SVGElement.prototype as unknown as { getBBox?: unknown }).getBBox;
});
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(dom.window, 'getComputedStyle').mockImplementation(element => ({
    fill: element.getAttribute('fill') ?? '',
    fillOpacity: element.getAttribute('fill-opacity') ?? '1',
  }) as unknown as CSSStyleDeclaration);
});
afterEach(() => {
  jest.restoreAllMocks();
});

interface BoxPaths { body: string; median: string; stems: string; caps: string }

const SET_D: BoxPaths = {
  body: 'M 463.47 231.154 L 531.13 231.154 531.13 189.892 463.47 189.892 Z',
  median: 'M 463.47 228.762 L 531.13 228.762',
  stems: 'M 497.3 277.798 L 497.3 231.154 M 497.3 189.892 L 497.3 142.65',
  caps: 'M 497.3 277.798 L 497.3 277.798 M 497.3 142.65 L 497.3 142.65',
};

const SET_E: BoxPaths = {
  body: 'M 585.27 210.822 L 652.93 210.822 652.93 183.314 585.27 183.314 Z',
  median: 'M 585.27 194.078 L 652.93 194.078',
  stems: 'M 619.1 212.018 L 619.1 210.822 M 619.1 183.314 L 619.1 166.57',
  caps: 'M 619.1 212.018 L 619.1 212.018 M 619.1 166.57 L 619.1 166.57',
};

/**
 * Draw boxes into one clipped layer, each box's paths in `order`: AnyChart
 * draws the body, the median, the stems and then the caps.
 */
function drawBoxes(
  id: string,
  boxes: BoxPaths[],
  order: Array<keyof BoxPaths> = ['body', 'median', 'stems', 'caps'],
): HTMLElement {
  const container = document.createElement('div');
  container.id = id;
  const svg = document.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);
  document.body.appendChild(container);
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.id = 'ac_layer_boxes';
  layer.setAttribute('clip-path', 'url(#ac_clip_plot)');
  svg.appendChild(layer);

  boxes.forEach((box, i) => {
    const path = (d: string, attributes: Record<string, string>): void => {
      const el = document.createElementNS(SVG_NS, 'path');
      el.id = `ac_path_${i}_${layer.childElementCount}`;
      el.setAttribute('d', d);
      for (const [name, value] of Object.entries(attributes))
        el.setAttribute(name, value);
      layer.appendChild(el);
    };
    for (const part of order) {
      path(box[part], part === 'body'
        ? { 'fill': '#64b5f6', 'fill-opacity': '0.85', 'stroke': '#64b5f6' }
        : { fill: 'none', stroke: '#467fac' });
    }
  });
  return container;
}

function boxChart(container: HTMLElement): AnyChartInstance {
  const rows = [
    { x: 'Set D', lowest: 724, q1: 790, median: 794, q3: 860, highest: 940 },
    { x: 'Set E', lowest: 834, q1: 836, median: 864, q3: 882, highest: 910 },
  ];
  const series: AnyChartSeries = {
    id: () => 0,
    name: () => 'Sets',
    seriesType: () => 'box',
    getIterator: () => {
      let index = -1;
      return {
        advance: () => ++index < rows.length,
        get: (field: string) => (rows[index] as Record<string, unknown> | undefined)?.[field],
        getIndex: () => index,
        getRowsCount: () => rows.length,
        reset: () => {
          index = -1;
        },
      };
    },
    getPoint: () => ({ get: () => undefined, getIndex: () => 0, exists: () => false }),
    getStat: () => undefined,
  };
  return {
    title: () => 'Distribution Summary',
    container: () => container,
    getSeriesCount: () => 1,
    getSeriesAt: (i: number) => (i === 0 ? series : null),
  };
}

function cleanUp(container: HTMLElement): void {
  (container.closest('[data-maidr-anychart-host]') ?? container).remove();
}

/** The `d` of whatever carries one part of one box. */
function partOf(container: HTMLElement, box: string, part: string): string[] {
  return Array.from(container.querySelectorAll(
    `[data-maidr-anychart-box="${box}"][data-maidr-anychart-box-part="${part}"]`,
  )).map(el => el.getAttribute('d') ?? '');
}

describe('an anychart box plot whisker', () => {
  it('is found when its stem is shorter than two pixels', () => {
    // The stem was dropped as a cap for being short, so "Set E, Minimum 834"
    // outlined nothing.
    const container = drawBoxes('box-short-stem', [SET_D, SET_E]);
    const warn = jest.spyOn(console, 'warn');

    bindAnyChart(boxChart(container));

    expect(partOf(container, '0-1', 'min')).toEqual(['M 619.1 212.018 L 619.1 210.822']);
    expect(partOf(container, '0-1', 'max')).toEqual(['M 619.1 183.314 L 619.1 166.57']);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('expected 2 whiskers');

    cleanUp(container);
  });

  it('is still told apart from the caps at the ends of the stems', () => {
    const container = drawBoxes('box-caps', [SET_D, SET_E]);

    bindAnyChart(boxChart(container));

    expect(partOf(container, '0-0', 'min')).toEqual(['M 497.3 277.798 L 497.3 231.154']);
    expect(partOf(container, '0-0', 'max')).toEqual(['M 497.3 189.892 L 497.3 142.65']);
    // Each cap is a point at the far end of its stem, and no part of a box.
    for (const caps of [SET_D.caps, SET_E.caps]) {
      const path = Array.from(container.querySelectorAll('path'))
        .find(el => el.getAttribute('d') === caps);
      expect(path?.hasAttribute('data-maidr-anychart-box')).toBe(false);
    }

    cleanUp(container);
  });

  it('still passes over caps drawn across the stems, even ahead of them', () => {
    // With a whisker width set, each cap is a flat stroke across the end of
    // its stem. Drawn before the stems, it is looked at first.
    const boxes: BoxPaths[] = [
      { ...SET_D, caps: 'M 487.3 277.798 L 507.3 277.798 M 487.3 142.65 L 507.3 142.65' },
      { ...SET_E, caps: 'M 609.1 212.018 L 629.1 212.018 M 609.1 166.57 L 629.1 166.57' },
    ];
    const container = drawBoxes('box-wide-caps', boxes, ['body', 'median', 'caps', 'stems']);

    bindAnyChart(boxChart(container));

    expect(partOf(container, '0-0', 'min')).toEqual(['M 497.3 277.798 L 497.3 231.154']);
    expect(partOf(container, '0-1', 'min')).toEqual(['M 619.1 212.018 L 619.1 210.822']);
    for (const { caps } of boxes) {
      const path = Array.from(container.querySelectorAll('path'))
        .find(el => el.getAttribute('d') === caps);
      expect(path?.hasAttribute('data-maidr-anychart-box')).toBe(false);
    }

    cleanUp(container);
  });
});
