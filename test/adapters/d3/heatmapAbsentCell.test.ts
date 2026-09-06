/**
 * @jest-environment jsdom
 */
/**
 * A d3 heatmap cell the join never drew (#1191).
 *
 * `HeatmapData.points` spells a cell the chart drew no value at as `null`,
 * because a grid is a rectangle and an adapter whose data does not fill it has
 * to be able to say so. The d3 binder instead threw
 * "Missing heatmap cell for y=…, x=…" the moment the cross-product of the
 * observed labels was not fully covered — a sparse tidy array, which is the
 * ordinary shape for a d3 join, aborted the whole bind. In the React path
 * `useD3Adapter` catches that and publishes nothing, so the chart gets no
 * accessible layer at all.
 *
 * The per-cell selectors are keyed to `points[row][col]`, so the hole has to
 * be spelled there too: a `null` in the row keeps every drawn cell's selector
 * aligned with the value it names.
 */
import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { bindD3Heatmap } from '@adapters/d3/binders/heatmap';
import { beforeEach, describe, expect, it } from '@jest/globals';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One cell of the tidy array a d3 heatmap joins over. */
interface Cell {
  day: string;
  slot: string;
  value: number;
}

const COMPLETE: Cell[] = [
  { day: 'Mon', slot: 'AM', value: 5 },
  { day: 'Tue', slot: 'AM', value: 7 },
  { day: 'Mon', slot: 'PM', value: 2 },
  { day: 'Tue', slot: 'PM', value: 4 },
];

/** The same chart with `Tue`/`PM` never recorded, so no rect is drawn for it. */
const SPARSE: Cell[] = COMPLETE.filter(cell => !(cell.day === 'Tue' && cell.slot === 'PM'));

/**
 * A d3-joined heatmap: one `<rect>` per drawn cell, carrying its `__data__`.
 * @param cells - The tidy rows the join ran over
 * @returns The SVG root
 */
function buildSvg(cells: Cell[]): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.id = 'chart';
  for (const cell of cells) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'cell');
    (rect as unknown as { __data__: unknown }).__data__ = cell;
    svg.appendChild(rect);
  }
  document.body.appendChild(svg);
  return svg;
}

/**
 * The layer a joined heatmap converts to.
 * @param cells - The tidy rows the join ran over
 * @returns The emitted layer
 */
function layerFor(cells: Cell[]): MaidrLayer {
  const svg = buildSvg(cells);
  return bindD3Heatmap(svg, {
    selector: 'rect.cell',
    x: 'day',
    y: 'slot',
    value: 'value',
    yOrder: ['AM', 'PM'],
    xOrder: ['Mon', 'Tue'],
  }).layer;
}

describe('a d3 heatmap missing a cell', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('reads the chart instead of aborting the bind', () => {
    const points = (layerFor(SPARSE).data as HeatmapData).points;

    expect(points).toEqual([[5, 7], [2, null]]);
  });

  it('keeps the absent cell distinguishable from one drawn as zero', () => {
    const zeroed = COMPLETE.map(cell =>
      cell.day === 'Tue' && cell.slot === 'PM' ? { ...cell, value: 0 } : cell,
    );

    const absent = (layerFor(SPARSE).data as HeatmapData).points;
    const drawnZero = (layerFor(zeroed).data as HeatmapData).points;

    expect(absent).not.toEqual(drawnZero);
  });

  it('leaves a hole in the selector grid so the rest stay aligned', () => {
    const layer = layerFor(SPARSE);

    // The payload runs top-first while the selector grid is laid out the way
    // `Heatmap` indexes it, bottom row first — so the hole in the `PM` row
    // sits at `selectors[0][1]`.
    const selectors = layer.selectors as (string | null)[][];
    expect(selectors.map(row => row.length)).toEqual([2, 2]);
    expect(selectors[0][1]).toBeNull();
    for (const selector of selectors.flat().filter((one): one is string => one !== null)) {
      expect(document.querySelectorAll(selector)).toHaveLength(1);
    }
  });
});
