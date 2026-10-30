/**
 * @jest-environment jsdom
 */

import type { Trace } from '@model/plot';
import type { Maidr, MaidrLayer, MosaicPoint, ScatterPoint } from '@type/grammar';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';

/**
 * An authored example's selectors name the marks its data is drawn as, in
 * the shape its layer type reads.
 *
 * Audio, text and braille read the data, so a layer whose selectors pair its
 * points with the wrong marks, or with none, still reads correctly to anyone
 * listening: only the outline a sighted or low-vision reader follows is
 * wrong, which is the blind spot #814 names. Each case therefore walks the
 * example the way a reader does and measures the mark each step outlines.
 */

const EXAMPLES = join(__dirname, '..', '..', 'examples');

/**
 * Undoes the entity escaping a `maidr` attribute carries.
 *
 * @param raw - The attribute's text as it appears in the page
 * @returns The JSON it stands for
 */
function unescapeHtml(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, '\'')
    .replace(/&#39;/g, '\'')
    .replace(/&apos;/g, '\'')
    .replace(/&#10;/g, '\n')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/**
 * Every layer of every spec a page carries in a `maidr` or `maidr-data`
 * attribute.
 *
 * @param html - The page's HTML
 * @returns The layers, chart by chart and subplot by subplot
 */
function layersOf(html: string): MaidrLayer[] {
  return [...html.matchAll(/\smaidr(?:-data)?=(['"])(\{[\s\S]*?\})\1/g)].flatMap((attribute) => {
    const spec = JSON.parse(unescapeHtml(attribute[2])) as Maidr;
    return spec.subplots.flat().flatMap(subplot => subplot.layers);
  });
}

/**
 * Puts an example page in the DOM.
 *
 * @param page - The file name under `examples/`
 * @returns The page's HTML and its layers
 */
function load(page: string): { html: string; layers: MaidrLayer[] } {
  const html = readFileSync(join(EXAMPLES, page), 'utf8');
  document.body.innerHTML = html;
  return { html, layers: layersOf(html) };
}

/**
 * What a trace outlines at a cell.
 *
 * @param trace - The trace
 * @param row - The cell's row
 * @param col - The cell's column
 * @returns The highlighted elements, none when nothing is outlined
 */
function outlinedAt(trace: Trace, row: number, col: number): Element[] {
  trace.moveToIndex(row, col);
  const state = trace.state;
  if (state.empty || state.type !== 'trace' || state.highlight.empty) {
    return [];
  }
  const elements = state.highlight.elements;
  return Array.isArray(elements) ? elements : [elements];
}

/**
 * The numbers a path's `d` begins with: where it starts drawing.
 *
 * @param element - A `<path>`
 * @returns Its first `x` and `y`
 */
function startOf(element: Element): { x: number; y: number } {
  const [x, y] = (element.getAttribute('d') ?? '').match(/-?[\d.]+/g)?.map(Number) ?? [];
  return { x, y };
}

/** Whether this file put the `SVGPathElement` shim in place. */
let shimmed = false;

beforeAll(() => {
  // jsdom implements none of the per-tag SVG interfaces, so the
  // `instanceof SVGPathElement` a line trace asks of each element it reads
  // would throw. Answer it by tag, as a browser would.
  if ('SVGPathElement' in globalThis) {
    return;
  }
  shimmed = true;
  Object.defineProperty(globalThis, 'SVGPathElement', {
    configurable: true,
    writable: true,
    value: class SVGPathElementShim {
      public static [Symbol.hasInstance](value: unknown): boolean {
        return value instanceof SVGElement && value.tagName === 'path';
      }
    },
  });
});

afterAll(() => {
  if (shimmed) {
    delete (globalThis as { SVGPathElement?: unknown }).SVGPathElement;
  }
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('an authored example\'s selectors name the marks its data is drawn as', () => {
  it('outlines each mosaic tile the reader is on, and Up climbs its column', () => {
    // The tiles are drawn column by column, each from the bottom up, and the
    // layer listed its top series first with no domMapping: "First,
    // Survived" outlined First's Died tile, and Up went down the column.
    const { layers: [layer] } = load('mosaic.html');
    const trace = TraceFactory.create(layer);
    const series = layer.data as MosaicPoint[][];
    const plotHeight = 240;

    const wrong: string[] = [];
    for (const [row, cells] of series.entries()) {
      for (const [col, cell] of cells.entries()) {
        const [tile] = outlinedAt(trace, row, col);
        const height = Number(tile?.getAttribute('height'));
        const columnLeft = Number(outlinedAt(trace, 0, col)[0]?.getAttribute('x'));
        if (Math.abs(height - Number(cell.y) * plotHeight) > 1 || Number(tile?.getAttribute('x')) !== columnLeft) {
          wrong.push(`${cell.x}, ${cell.z}`);
        }
      }
    }
    const climbs = series[0].every((_, col) => series.every((__, row) =>
      row === 0 || Number(outlinedAt(trace, row, col)[0]?.getAttribute('y'))
      < Number(outlinedAt(trace, row - 1, col)[0]?.getAttribute('y'))));
    trace.dispose();

    expect(wrong).toEqual([]);
    expect(climbs).toBe(true);
  });

  it.each([
    // An icicle's bands are 90 high from y 60, one per depth.
    ['icicle.html', (mark: Element) => (startOf(mark).y - 60) / 90],
    // A sunburst's rings start their arcs on their outer edges, 90 and 160
    // from the centre at 200, 200.
    ['sunburst.html', (mark: Element) => Math.hypot(startOf(mark).x - 200, startOf(mark).y - 200) > 100 ? 1 : 0],
  ])('outlines every node of %s with the mark drawn for it, on its own level', (page, depthOf) => {
    // Only the leaves were declared, so a continent had no selector: the
    // level the reader enters on outlined no mark of its own (since #1520,
    // the leaves below it instead).
    const { layers: [layer] } = load(page);
    const trace = TraceFactory.create(layer);
    const levels = [3, 10];

    const wrong: string[] = [];
    for (const [depth, count] of levels.entries()) {
      for (let index = 0; index < count; index++) {
        const outlined = outlinedAt(trace, depth, index);
        if (outlined.length !== 1 || depthOf(outlined[0]) !== depth) {
          wrong.push(`${depth},${index}: ${outlined.length} marks`);
        }
      }
    }
    trace.dispose();

    expect(wrong).toEqual([]);
  });

  it('outlines each car\'s own line at the variable read', () => {
    // One selector string is one series to the line family; the layer has
    // four, so nothing was outlined at all.
    const { layers: [layer] } = load('parallel.html');
    // Counted before the trace is made: a line trace takes the layer's rows
    // as its own and empties them when it is disposed.
    const readings = (layer.data as unknown[][]).map(row => row.length);
    const trace = TraceFactory.create(layer);
    const lines = [...document.querySelectorAll('g[id=\'parallel-lines\'] > polyline')]
      .map(line => (line.getAttribute('points') ?? '').trim().split(/\s+/).map(pair => pair.split(',').map(Number)));

    const wrong: string[] = [];
    for (const [row, count] of readings.entries()) {
      for (let col = 0; col < count; col++) {
        const [marker] = outlinedAt(trace, row, col);
        const [x, y] = lines[row][col];
        if (Number(marker?.getAttribute('cx')) !== x || Number(marker?.getAttribute('cy')) !== y) {
          wrong.push(`${row},${col}`);
        }
      }
    }
    trace.dispose();

    expect(readings).toHaveLength(4);
    expect(wrong).toEqual([]);
  });

  it('reads the iris species the legend draws, each layer outlining its own points', () => {
    // The scatter colours its points by species under a "species" legend,
    // and declared one layer whose points carried a "Petal Length (cm)" that
    // was neither plotted nor the iris data's petal length.
    const { html, layers } = load('scatter_plot.html');

    const colours = layers.map((layer) => {
      const drawn = [...document.querySelectorAll(layer.selectors as string)];
      return [...new Set(drawn.map(mark => mark.getAttribute('style')?.match(/fill: (#[0-9a-f]+)/)?.[1]))];
    });
    // A legend entry is the swatch drawn just before its name.
    const swatch = (name: string): string | undefined => {
      const before = html.slice(0, html.indexOf(`<!-- ${name} -->`));
      return [...before.matchAll(/<use [^>]*style="fill: (#[0-9a-f]+)/g)].at(-1)?.[1];
    };

    expect(layers.map(layer => layer.name)).toEqual(['setosa', 'versicolor', 'virginica']);
    expect(layers.map(layer => (layer.data as ScatterPoint[]).length)).toEqual([50, 50, 50]);
    expect(layers.flatMap(layer => (layer.data as ScatterPoint[]).filter(point => point.z !== undefined))).toEqual([]);
    expect(colours).toEqual(layers.map(layer => [swatch(layer.name ?? '')]));
  });

  it('names a point layer\'s marks with the one selector string its type reads', () => {
    // A list reaches these types as the pre-4.0 shape, joined into one
    // selector with a console warning on every load (docs/SCHEMA.md).
    const listed = readdirSync(EXAMPLES)
      .filter(name => name.endsWith('.html'))
      .flatMap(name => layersOf(readFileSync(join(EXAMPLES, name), 'utf8'))
        .filter(layer => ['point', 'sunflower', 'volcano', 'manhattan'].includes(layer.type)
          && Array.isArray(layer.selectors))
        .map(layer => `${name} (${layer.type})`));

    expect(listed).toEqual([]);
  });
});
