import type { GanttData } from '@type/grammar';
import { bindD3Gantt } from '@adapters/d3/binders/gantt';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { Orientation, TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

/**
 * Builds an SVG holding one `rect.task` per datum, the way
 * `selectAll('rect.task').data(intervals).join('rect')` would leave it.
 */
function buildGanttSvg(intervals: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="gt-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of intervals) {
    const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'task');
    (rect as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(rect);
  }
  return svg;
}

/**
 * A schedule whose rects are NOT drawn lane by lane — the ordinary result of
 * one flat `.data(rows)` join over rows sorted by start date.
 */
const INTERLEAVED = [
  { x: 'Design', start: 0, end: 30, label: 'Wireframes' },
  { x: 'Build', start: 30, end: 100, label: 'Implementation' },
  { x: 'Design', start: 60, end: 75, label: 'Revisions' },
  { x: 'Review', start: 75, end: 90 },
];

describe('bindD3Gantt', () => {
  test('nests the intervals by lane rather than by DOM order', () => {
    const svg = buildGanttSvg(INTERLEAVED);

    const result = bindD3Gantt(svg, {
      selector: 'rect.task',
      title: 'Project Schedule',
      axes: { x: 'Day', y: 'Phase' },
      unit: 'days',
    });

    expect(result.layer.type).toBe(TraceType.GANTT);
    const data = result.layer.data as GanttData;
    expect(data.points).toEqual([
      [
        { x: 'Design', start: 0, end: 30, label: 'Wireframes' },
        { x: 'Design', start: 60, end: 75, label: 'Revisions' },
      ],
      [{ x: 'Build', start: 30, end: 100, label: 'Implementation' }],
      [{ x: 'Review', start: 75, end: 90 }],
    ]);
    expect(data.unit).toBe('days');
  });

  test('keeps a declared empty lane, which the DOM cannot carry', () => {
    // A lane with nothing booked has no element at all, and an empty row is a
    // real statement about a schedule — so it can only come from config.
    const svg = buildGanttSvg(INTERLEAVED);

    const result = bindD3Gantt(svg, {
      selector: 'rect.task',
      lanes: ['Design', 'Build', 'Review', 'Launch'],
    });

    const data = result.layer.data as GanttData;
    expect(data.points).toHaveLength(4);
    expect(data.points[3]).toEqual([]);
    expect(data.lanes).toEqual(['Design', 'Build', 'Review', 'Launch']);
  });

  test('appends a lane the chart drew and the config did not declare', () => {
    const svg = buildGanttSvg(INTERLEAVED);

    const result = bindD3Gantt(svg, {
      selector: 'rect.task',
      lanes: ['Design', 'Launch'],
    });

    const data = result.layer.data as GanttData;
    // Declared order first, then whatever was drawn — and the names stay
    // positional with `points`, which is what the trace reads them by.
    expect(data.lanes).toEqual(['Design', 'Launch', 'Build', 'Review']);
    expect(data.points[1]).toEqual([]);
    expect(data.points[2]).toEqual([{ x: 'Build', start: 30, end: 100, label: 'Implementation' }]);
  });

  test('coerces dates to epoch milliseconds so lengths can be measured', () => {
    const svg = buildGanttSvg([
      { x: 'Design', start: new Date('2024-01-01T00:00:00Z'), end: new Date('2024-01-08T00:00:00Z') },
      { x: 'Build', start: '2024-01-08T00:00:00Z', end: '2024-02-01T00:00:00Z' },
    ]);

    const result = bindD3Gantt(svg, { selector: 'rect.task' });

    const data = result.layer.data as GanttData;
    expect(data.points[0][0]).toEqual({
      x: 'Design',
      start: Date.parse('2024-01-01T00:00:00Z'),
      end: Date.parse('2024-01-08T00:00:00Z'),
    });
    expect(data.points[1][0].start).toBe(Date.parse('2024-01-08T00:00:00Z'));
  });

  test('says what to do when an end is neither a number nor a date', () => {
    const svg = buildGanttSvg([{ x: 'Design', start: 'soon', end: 30 }]);

    expect(() => bindD3Gantt(svg, { selector: 'rect.task' }))
      .toThrow(/neither a number nor a parsable date/);
  });

  test('leaves an interval unlabelled when the lane already names it', () => {
    const svg = buildGanttSvg([{ label: 'Design', start: 0, end: 30 }]);

    const result = bindD3Gantt(svg, { selector: 'rect.task' });

    const data = result.layer.data as GanttData;
    expect(data.points[0][0]).toEqual({ x: 'Design', start: 0, end: 30 });
  });

  test('emits one selector per interval, in the payload\'s lane order', () => {
    const svg = buildGanttSvg(INTERLEAVED);

    const result = bindD3Gantt(svg, { selector: 'rect.task' });

    // The trace slices a FLAT element list lane by lane, so a bare selector
    // resolving in DOM order would hand Design the Build rect — and the count
    // would still match, so nothing would look wrong.
    const selectors = result.layer.selectors as string[];
    expect(selectors).toHaveLength(4);
    const labels = selectors.map((one) => {
      const element = svg.ownerDocument.querySelector(one);
      const datum = (element as unknown as { __data__: { label?: string; x: string } }).__data__;
      return datum.label ?? datum.x;
    });
    expect(labels).toEqual(['Wireframes', 'Revisions', 'Implementation', 'Review']);
  });

  test('defaults to the orientation a schedule is drawn in', () => {
    const svg = buildGanttSvg(INTERLEAVED);

    const result = bindD3Gantt(svg, { selector: 'rect.task' });

    // Bars run left to right, which puts the axis on x and the lanes on y.
    expect(result.layer.orientation).toBe(Orientation.HORIZONTAL);
  });

  test('throws an actionable error when the selector matches no intervals', () => {
    const svg = buildGanttSvg(INTERLEAVED);

    expect(() => bindD3Gantt(svg, { selector: 'rect.bar' })).toThrow(/gantt interval/);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildGanttSvg(INTERLEAVED);
    const result = bindD3Gantt(svg, {
      selector: 'rect.task',
      title: 'Project Schedule',
      axes: { x: 'Day', y: 'Phase' },
      lanes: ['Design', 'Build', 'Review', 'Launch'],
      unit: 'days',
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.GANTT]);
    });
  });
});
