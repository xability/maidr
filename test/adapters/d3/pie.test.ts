import type { PiePoint } from '@type/grammar';
import { bindD3Pie } from '@adapters/d3/binders/pie';
import { describe, expect, test } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/** The shape `d3.pie()` emits for one slice, around the caller's own datum. */
function arc(data: unknown, value: number, index: number): unknown {
  return {
    data,
    value,
    index,
    startAngle: index,
    endAngle: index + 1,
    padAngle: 0,
  };
}

/**
 * Builds an SVG holding one `path.slice` per datum, in the order given, with
 * each datum bound the way `selectAll('path.slice').data(...).join('path')`
 * would leave it.
 */
function buildPieSvg(data: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="pie-svg"></svg>`);
  const svg = dom.window.document.querySelector('svg') as unknown as SVGElement;
  for (const datum of data) {
    const path = dom.window.document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'slice');
    (path as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(path);
  }
  return svg;
}

describe('bindD3Pie', () => {
  test('emits a flat pie layer from d3.pie() arcs, taking the magnitude from the layout', () => {
    const svg = buildPieSvg([
      arc({ fruit: 'Apples', units: 30 }, 30, 0),
      arc({ fruit: 'Bananas', units: 50 }, 50, 1),
      arc({ fruit: 'Cherries', units: 20 }, 20, 2),
    ]);

    const result = bindD3Pie(svg, {
      selector: 'path.slice',
      title: 'Fruit sales',
      axes: { x: 'Fruit', y: 'Units' },
      x: 'fruit',
    });

    expect(result.layer.type).toBe(TraceType.PIE);
    // Flat PiePoint[], never the nested array the bar family uses.
    expect(result.layer.data).toEqual([
      { x: 'Apples', y: 30 },
      { x: 'Bananas', y: 50 },
      { x: 'Cherries', y: 20 },
    ]);
    expect(result.layer.selectors).toBe('#pie-svg path.slice');
    expect(result.layer.axes).toEqual({ x: { label: 'Fruit' }, y: { label: 'Units' } });
  });

  test('emits no orientation and no z axis', () => {
    const svg = buildPieSvg([
      arc({ label: 'A', value: 1 }, 1, 0),
      arc({ label: 'B', value: 2 }, 2, 1),
    ]);

    const result = bindD3Pie(svg, {
      selector: 'path.slice',
      axes: { x: 'Group', y: 'Count' },
    });

    // A pie has no orientation, and its percentage is derived from the values
    // rather than labelled by a fill axis.
    expect(result.layer.orientation).toBeUndefined();
    expect(result.layer.axes?.z).toBeUndefined();
    // `label` / `value` are inferred from the user's datum, not from the arc.
    expect(result.layer.data).toEqual([
      { x: 'A', y: 1 },
      { x: 'B', y: 2 },
    ]);
  });

  test('keeps slices in DOM order, which is the order d3.pie() returns arcs in', () => {
    // d3.pie() sorts by value for drawing but returns arcs in input order, so
    // a sorted pie still joins its wedges in the data's own order.
    const svg = buildPieSvg([
      arc({ label: 'Small', value: 5 }, 5, 2),
      arc({ label: 'Large', value: 60 }, 60, 0),
      arc({ label: 'Medium', value: 35 }, 35, 1),
    ]);

    const result = bindD3Pie(svg, { selector: 'path.slice' });

    expect((result.layer.data as PiePoint[]).map(point => point.x))
      .toEqual(['Small', 'Large', 'Medium']);
  });

  test('labels a slice with its own datum when the pie was drawn from bare numbers', () => {
    const svg = buildPieSvg([arc(30, 30, 0), arc(70, 70, 1)]);

    const result = bindD3Pie(svg, { selector: 'path.slice' });

    expect(result.layer.data).toEqual([
      { x: 30, y: 30 },
      { x: 70, y: 70 },
    ]);
  });

  test('reads a hand-drawn pie through the accessors, treating an absent value as a gap', () => {
    // No d3.pie() layout: the wedge carries the user's datum directly.
    const svg = buildPieSvg([
      { name: 'Measured', units: 40 },
      { name: 'Unmeasured', units: null },
    ]);

    const result = bindD3Pie(svg, {
      selector: 'path.slice',
      x: 'name',
      y: 'units',
    });

    const data = result.layer.data as PiePoint[];
    expect(data[0]).toEqual({ x: 'Measured', y: 40 });
    // A gap must not collapse into a real zero: `Number(null)` is 0, which
    // would be sonified, totalled, and offered as a minimum.
    expect(data[1].x).toBe('Unmeasured');
    expect(Number.isNaN(data[1].y)).toBe(true);
  });

  test('throws an actionable error when the selector matches no wedges', () => {
    const svg = buildPieSvg([arc({ label: 'A', value: 1 }, 1, 0)]);

    expect(() => bindD3Pie(svg, { selector: 'path.wedge' }))
      .toThrow(/pie slice/);
  });
});
