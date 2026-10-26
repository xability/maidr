/**
 * The columns an AnyChart sankey draws its nodes in.
 *
 * AnyChart puts every node nothing leaves in the last column and reorders each
 * column to shorten the ribbons, so the columns are not something the flows
 * say. The labels below are `examples/anychart/sankey.html` as Chromium drew
 * it: Losses, fed only by Coal, sits in the last column between Homes and
 * Industry.
 */

import type { AnyChartInstance } from '@adapters/anychart/types';
import type { FlowOptions } from '@type/grammar';
import { anyChartToMaidr } from '@adapters/anychart/converters';
import { afterEach, describe, expect, it } from '@jest/globals';
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
});

const SVG_NS = 'http://www.w3.org/2000/svg';

const FLOWS: Array<[string, string, number]> = [
  ['Coal', 'Electricity', 34],
  ['Coal', 'Heat', 14],
  ['Coal', 'Losses', 8],
  ['Gas', 'Electricity', 12],
  ['Gas', 'Heat', 6],
  ['Electricity', 'Homes', 30],
  ['Electricity', 'Industry', 16],
  ['Heat', 'Homes', 20],
];

/** Each label's box, in the order AnyChart writes them. */
const LABELS: Array<[string, number, number, number, number]> = [
  ['Energy flow', 333, 10, 84, 18],
  ['Coal', 12.2, 196.5, 20.6, 11],
  ['Gas', 13.3, 410, 18.3, 11],
  ['Electricity', 354.1, 212, 42.8, 12],
  ['Heat', 364.8, 404, 21.3, 11],
  ['Losses', 712.7, 340.5, 31.7, 11],
  ['Homes', 712.7, 171.5, 31.7, 11],
  ['Industry', 710.7, 415, 35.6, 12],
];

function drawSankey(id: string, labels: typeof LABELS): { chart: AnyChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  container.id = id;
  const svg = document.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);
  document.body.appendChild(container);
  for (const [name, x, y, width, height] of labels) {
    const text = document.createElementNS(SVG_NS, 'text');
    text.textContent = name;
    Object.defineProperty(text, 'getBBox', { value: () => ({ x, y, width, height }) });
    svg.appendChild(text);
  }

  const rows = FLOWS.map(([from, to, weight]) => ({ from, to, weight }));
  const chart = {
    title: () => 'Energy flow',
    container: () => container,
    getType: () => 'sankey',
    data: () => ({
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
    }),
  } as unknown as AnyChartInstance;
  return { chart, container };
}

function flowOptionsOf(chart: AnyChartInstance): FlowOptions | undefined {
  return anyChartToMaidr(chart)?.subplots[0][0].layers[0].flowOptions;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('an anychart sankey', () => {
  it('declares the columns its nodes are drawn in, each top to bottom', () => {
    // Without them MAIDR placed Losses one column past Coal, beside
    // Electricity and Heat, and Up and Down walked a column the chart does not
    // draw.
    const { chart } = drawSankey('sankey-drawn', LABELS);

    expect(flowOptionsOf(chart)?.columns).toEqual([
      ['Coal', 'Gas'],
      ['Electricity', 'Heat'],
      ['Homes', 'Losses', 'Industry'],
    ]);
  });

  it('leaves the columns to MAIDR when a node has no label to place it by', () => {
    const { chart } = drawSankey('sankey-unlabelled', LABELS.filter(([name]) => name !== 'Losses'));

    expect(flowOptionsOf(chart)).toBeUndefined();
  });
});
