/**
 * A heatmap drawn as one image highlights row 0 at the bottom (#971).
 *
 * A chart library that rasterises its grid — plotly is the one that does —
 * gives MAIDR a single `<image>` rather than a cell per rect, so `Heatmap`
 * synthesises its own transparent overlay rects. Those have to follow the
 * same convention the rect and path branches flip the DOM index for: row 0
 * is the *bottom* of the visual grid.
 *
 * They did not. Row `r` was placed at `imgY + r * cellH`, and SVG `y` grows
 * downward, so row 0 landed on the top band. That was invisible for as long
 * as the plotly adapter also emitted its rows upside down — the two errors
 * cancelled — and would have become a visible mis-highlight the moment
 * either was corrected alone.
 */
import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, it } from '@jest/globals';
import { Heatmap } from '@model/heatmap';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const IMG_Y = 100;
const IMG_H = 300;
const ROWS = 3;
const CELL_H = IMG_H / ROWS;

/**
 * A document holding one `<image>`, the shape a rasterised heatmap arrives in.
 */
function installDom(): void {
  const dom = new JSDOM(
    `<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="hm">`
    + `<image class="cells" x="10" y="${IMG_Y}" width="200" height="${IMG_H}"/>`
    + `</svg>`,
  );
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = dom.window.document;
  g.SVGElement = dom.window.SVGElement;
  // jsdom does not expose the specialised SVG constructors, so alias the one
  // the branch under test checks for and keep the others disjoint.
  g.SVGImageElement = dom.window.SVGElement;
  g.SVGRectElement = class SVGRectElementStub {};
  g.SVGPathElement = class SVGPathElementStub {};
}

afterEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.document;
  delete g.SVGElement;
  delete g.SVGImageElement;
  delete g.SVGRectElement;
  delete g.SVGPathElement;
});

/** The layer, written top-first as the grammar requires. */
function layer(): MaidrLayer {
  const data: HeatmapData = {
    x: ['c1', 'c2'],
    y: ['top', 'middle', 'bottom'],
    points: [[5, 6], [3, 4], [1, 2]],
  };
  return {
    id: 'hm',
    type: TraceType.HEATMAP,
    selectors: '#hm .cells',
    axes: { x: { label: 'X' }, y: { label: 'Y' }, z: { label: 'Value' } },
    data,
  } as unknown as MaidrLayer;
}

/** The `y` attribute of the overlay rect for each internal row. */
function overlayTops(): number[] {
  const trace = new Heatmap(layer()) as unknown as {
    highlightValues: SVGElement[][] | null;
  };
  const rows = trace.highlightValues;
  if (!rows)
    throw new Error('no overlay built');
  return rows.map(row => Number(row[0].getAttribute('y')));
}

describe('overlay rects for a rasterised heatmap', () => {
  it('puts row 0 on the bottom band of the image', () => {
    installDom();

    // Row 0 is the bottom of the visual grid, so it belongs on the last band:
    // 100 + 2 * 100. Before the fix this was 100, the top band.
    expect(overlayTops()[0]).toBe(IMG_Y + (ROWS - 1) * CELL_H);
  });

  it('climbs the image as the row index grows', () => {
    installDom();

    // Increasing row = moving up = a smaller SVG y.
    expect(overlayTops()).toEqual([300, 200, 100]);
  });

  it('lands the announced row on the band that holds it', () => {
    installDom();

    // 'bottom' is internal row 0 after the constructor's reversal, and the
    // bottom of the image is where it is drawn.
    const trace = new Heatmap(layer()) as unknown as {
      state: { text?: { cross?: { value?: unknown } } };
      highlightValues: SVGElement[][] | null;
    };

    expect(trace.state.text?.cross?.value).toBe('bottom');
    expect(trace.highlightValues?.[0][0].getAttribute('y')).toBe(String(IMG_Y + IMG_H - CELL_H));
  });
});
