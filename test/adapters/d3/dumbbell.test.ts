import type { DumbbellData } from '@type/grammar';
import { bindD3Dumbbell } from '@adapters/d3/binders/dumbbell';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { Orientation, TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

/**
 * Builds an SVG holding what a dumbbell chart draws per row: a connector and
 * the two dots it joins, each carrying the same datum. Only the connector maps
 * one-to-one onto the data, which is the thing the binder has to get right.
 */
function buildDumbbellSvg(data: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="db-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of data) {
    const connector = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
    connector.setAttribute('class', 'connector');
    (connector as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(connector);
    for (const end of ['start', 'end']) {
      const dot = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('class', `dot ${end}`);
      (dot as unknown as { __data__: unknown }).__data__ = datum;
      svg.appendChild(dot);
    }
  }
  return svg;
}

const ROWS = [
  { country: 'Denmark', y1990: 71.2, y2020: 78.4 },
  { country: 'Latvia', y1990: 74.6, y2020: 69.5 },
  { country: 'Malta', y1990: 76.0, y2020: 76.0 },
];

describe('bindD3Dumbbell', () => {
  test('emits the object payload, with the end names on the chart', () => {
    const svg = buildDumbbellSvg(ROWS);

    const result = bindD3Dumbbell(svg, {
      selector: 'line.connector',
      title: 'Life Expectancy, 1990 against 2020',
      orientation: Orientation.HORIZONTAL,
      axes: { x: 'Years', y: 'Country' },
      x: 'country',
      start: 'y1990',
      end: 'y2020',
      startLabel: '1990',
      endLabel: '2020',
    });

    expect(result.layer.type).toBe(TraceType.DUMBBELL);
    // Not an array: the two end names belong to the chart, not to a row.
    expect(result.layer.data).toEqual({
      points: [
        { x: 'Denmark', start: 71.2, end: 78.4 },
        { x: 'Latvia', start: 74.6, end: 69.5 },
        { x: 'Malta', start: 76.0, end: 76.0 },
      ],
      startLabel: '1990',
      endLabel: '2020',
    });
    expect(result.layer.orientation).toBe(Orientation.HORIZONTAL);
  });

  test('leaves the end names out when the chart does not name them', () => {
    // Absent rather than empty, so the trace falls back to "start" and "end"
    // instead of announcing a blank label.
    const svg = buildDumbbellSvg([{ x: 'A', start: 1, end: 2 }]);

    const result = bindD3Dumbbell(svg, { selector: 'line.connector' });

    expect(result.layer.data).toEqual({ points: [{ x: 'A', start: 1, end: 2 }] });
  });

  test('keeps a row whose value fell, rather than ordering the two ends', () => {
    // Latvia's 2020 figure is below its 1990 one; `end` is the finishing value
    // and not the larger one, and reordering would invert the chart's finding.
    const svg = buildDumbbellSvg(ROWS);

    const result = bindD3Dumbbell(svg, {
      selector: 'line.connector',
      x: 'country',
      start: 'y1990',
      end: 'y2020',
    });

    const { points } = result.layer.data as DumbbellData;
    expect(points[1]).toEqual({ x: 'Latvia', start: 74.6, end: 69.5 });
  });

  test('highlights the connectors, one per row, and not the dots', () => {
    const svg = buildDumbbellSvg(ROWS);

    const result = bindD3Dumbbell(svg, {
      selector: 'line.connector',
      x: 'country',
      start: 'y1990',
      end: 'y2020',
    });

    expect(result.layer.selectors).toBe('#db-svg line.connector');
    // DumbbellTrace withdraws highlighting unless the element count equals the
    // row count — a selector that caught the dots would match three times over.
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength(ROWS.length);
  });

  test('throws an actionable error when the selector matches no connectors', () => {
    const svg = buildDumbbellSvg(ROWS);

    expect(() => bindD3Dumbbell(svg, { selector: 'line.link' })).toThrow(/dumbbell connector/);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildDumbbellSvg(ROWS);
    const result = bindD3Dumbbell(svg, {
      selector: 'line.connector',
      title: 'Life Expectancy',
      orientation: Orientation.HORIZONTAL,
      x: 'country',
      start: 'y1990',
      end: 'y2020',
      startLabel: '1990',
      endLabel: '2020',
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.DUMBBELL]);
    });
  });
});
