import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, test } from '@jest/globals';
import { Heatmap } from '@model/heatmap';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/**
 * A grid position the chart drew no element at (#1174).
 *
 * The companion to #1191, and a different absence. That one gave a cell a way
 * to say it holds no *value*; this one gives it a way to say the chart drew
 * no *rect* there. A cell can have either, both, or neither: a calendar draws
 * a white square for a day inside the year that carries no reading -- an
 * element with no value -- and draws nothing at all for the slots before
 * January's first weekday, which have neither.
 *
 * Before this, a `null` in the selector grid failed `Svg.selectElement` and
 * the model dropped the whole grid's highlighting. A calendar year that does
 * not begin on a Sunday and end on a Saturday -- which is six years in seven
 * at each end -- would therefore have cost all 365 of its days their outline
 * over a handful of corners that were never drawn.
 */

function installDom(html: string): void {
  const dom = new JSDOM(html);
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = dom.window.document;
  g.SVGElement = dom.window.SVGElement;
  g.SVGRectElement = dom.window.SVGRectElement ?? dom.window.SVGElement;
  g.SVGPathElement = dom.window.SVGPathElement ?? class SVGPathElementStub {};
  g.SVGImageElement = dom.window.SVGImageElement ?? class SVGImageElementStub {};
}

function uninstallDom(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.document;
  delete g.SVGElement;
  delete g.SVGRectElement;
  delete g.SVGPathElement;
  delete g.SVGImageElement;
}

/** Three cells drawn out of a 2x2 rectangle: the top-left one is missing. */
const RAGGED_SVG = '<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="hm">'
  + '<rect id="c01"/><rect id="c10"/><rect id="c11"/>'
  + '</svg>';

/**
 * `selectors[r][c]` is indexed by the model's own row, which is the reverse of
 * the payload's -- so the payload's top-left hole is the *last* row here.
 */
function layerOf(selectors: (string | null)[][] | undefined): MaidrLayer {
  return {
    id: 'hm',
    type: TraceType.HEATMAP,
    title: 'test',
    axes: { x: { label: 'Week' }, y: { label: 'Day' }, z: { label: 'Count' } },
    ...(selectors ? { selectors } : {}),
    data: {
      x: ['w1', 'w2'],
      y: ['Sun', 'Mon'],
      points: [[null, 2], [3, 4]],
    } satisfies HeatmapData,
  };
}

const RAGGED_SELECTORS: (string | null)[][] = [
  // Model row 0 is the payload's bottom row: both drawn.
  ['#c10', '#c11'],
  // Model row 1 is the payload's top row, whose first cell was never drawn.
  [null, '#c01'],
];

afterEach(() => {
  uninstallDom();
});

describe('a heat grid position the chart drew no element at', () => {
  test('leaves every other cell its highlight', () => {
    installDom(RAGGED_SVG);
    const trace = new Heatmap(layerOf(RAGGED_SELECTORS));

    trace.moveToIndex(0, 0);
    const state = trace.state;
    if (state.empty) {
      throw new Error('expected a populated state');
    }
    expect(state.highlight.empty).toBe(false);
  });

  test('reports nothing to outline at the position itself', () => {
    installDom(RAGGED_SVG);
    const trace = new Heatmap(layerOf(RAGGED_SELECTORS));

    // The payload's top-left, which is the model's row 1 column 0.
    trace.moveToIndex(1, 0);
    const state = trace.state;
    if (state.empty) {
      throw new Error('expected a populated state');
    }
    // Empty rather than an undefined element the highlight service would then
    // try to outline.
    expect(state.highlight.empty).toBe(true);
  });

  test('still announces the cell it cannot outline', () => {
    installDom(RAGGED_SVG);
    const trace = new Heatmap(layerOf(RAGGED_SELECTORS));

    trace.moveToIndex(1, 0);
    const state = trace.state;
    if (state.empty) {
      throw new Error('expected a populated state');
    }
    // The reading is the trace's job and the outline is the drawing's; a
    // position with no rect still has a row, a column and (here) no value.
    expect(state.text.main?.value).toBe('w1');
    expect(state.text.cross?.value).toBe('Sun');
    expect(Number.isFinite(state.text.z?.value as number)).toBe(false);
  });

  test('drops the whole grid when a named selector resolves to nothing', () => {
    installDom(RAGGED_SVG);
    const trace = new Heatmap(layerOf([
      ['#c10', '#c11'],
      // Not a hole -- a claim about an element that is not there, which is a
      // mapping the adapter got wrong rather than a cell nobody drew.
      ['#nope', '#c01'],
    ]));

    trace.moveToIndex(0, 0);
    const state = trace.state;
    if (state.empty) {
      throw new Error('expected a populated state');
    }
    expect(state.highlight.empty).toBe(true);
  });

  test('survives being disposed', () => {
    installDom(RAGGED_SVG);
    const trace = new Heatmap(layerOf(RAGGED_SELECTORS));

    // `dispose` walks every cell looking for elements MAIDR owns, and a hole
    // is not one.
    expect(() => trace.dispose()).not.toThrow();
  });
});
