/**
 * @jest-environment jsdom
 */

import type { Trace } from '@model/plot';
import type { ScatterTrace } from '@model/scatter';
import type {
  BarPoint,
  BoxenPoint,
  CandlestickPoint,
  CandlestickSelector,
  LinePoint,
  Maidr,
  MaidrLayer,
  SegmentedPoint,
} from '@type/grammar';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';
import { Context } from '@model/context';
import { TraceFactory } from '@model/factory';
import { Figure } from '@model/plot';

/**
 * An authored example's data is what its marks draw.
 *
 * Every number a reader hears comes from the data, and every mark a sighted
 * colleague sees comes from the SVG, and each example page carries both by
 * hand. Where they parted -- an outlier listed that no point draws, candle
 * highs and lows that no wick reaches, labels drawn on the next bar down, a
 * grid the braille display needs left undeclared -- the reader was told about
 * a chart that is not on the page, or not told one that is, and nothing
 * compared the two.
 *
 * Each case reads the page into the DOM and measures the marks its own
 * selectors name.
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
 * The object literal a script opens at an index, up to its matching brace.
 *
 * @param source - The script
 * @param start - The index of its opening brace
 * @returns The literal's source
 */
function objectAt(source: string, start: number): string {
  let depth = 0;
  let inString = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (inString) {
      if (char === '\\') {
        index++;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}' && --depth === 0) {
      return source.slice(start, index + 1);
    }
  }
  throw new Error('the object literal never closes');
}

/**
 * Puts an example page in the DOM and reads the spec it carries, in a
 * `var maidr = ...` script or in a `maidr` or `maidr-data` attribute.
 *
 * @param page - The file name under `examples/`
 * @returns The spec
 */
function loadSpec(page: string): Maidr {
  const html = readFileSync(join(EXAMPLES, page), 'utf8');
  document.body.innerHTML = html;
  const script = html.indexOf('var maidr = ');
  if (script !== -1) {
    return JSON.parse(objectAt(html, html.indexOf('{', script))) as Maidr;
  }
  const attribute = /\smaidr(?:-data)?=(['"])(\{[\s\S]*?\})\1/.exec(html);
  if (attribute === null) {
    throw new Error(`${page} declares no spec`);
  }
  return JSON.parse(unescapeHtml(attribute[2])) as Maidr;
}

/**
 * Puts an example page in the DOM and reads the layers of the spec it carries.
 *
 * @param page - The file name under `examples/`
 * @returns Every layer of the spec, subplot by subplot
 */
function loadLayers(page: string): MaidrLayer[] {
  return loadSpec(page).subplots.flat().flatMap(subplot => subplot.layers);
}

/**
 * The elements a selector names.
 *
 * @param selector - The selector
 * @returns Its matches, in document order
 */
function marks(selector: string): Element[] {
  return [...document.querySelectorAll(selector)];
}

/**
 * The `x` coordinates a path's `M` and `L` commands visit.
 *
 * @param path - A `<path>` drawn with absolute moves and lines
 * @returns Its vertices' `x`s
 */
function pathXs(path: Element): number[] {
  return [...(path.getAttribute('d') ?? '').matchAll(/[ML]\s*([-\d.]+)\s+[-\d.]+/g)].map(match => Number(match[1]));
}

/**
 * The `y` coordinates a path's `M` and `L` commands visit.
 *
 * @param path - A `<path>` drawn with absolute moves and lines
 * @returns Its vertices' `y`s
 */
function pathYs(path: Element): number[] {
  return [...(path.getAttribute('d') ?? '').matchAll(/[ML]\s*[-\d.]+\s+([-\d.]+)/g)].map(match => Number(match[1]));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('an authored example\'s data is what its marks draw', () => {
  it('lists no boxen outlier its distribution does not draw', () => {
    // Treatment listed an upper outlier at 130, and its group draws its four
    // rungs and its median and nothing else, so the description and the
    // table reported an outlier that is not on the chart.
    const [layer] = loadLayers('boxen.html');
    const distributions = layer.data as BoxenPoint[];

    const undrawn = distributions.filter((distribution) => {
      const outliers = [...(distribution.lowerOutliers ?? []), ...(distribution.upperOutliers ?? [])];
      return marks(`g[id='boxen-${distribution.z}'] circle`).length !== outliers.length;
    }).map(distribution => distribution.z);

    expect(distributions).toHaveLength(2);
    expect(undrawn).toEqual([]);
  });

  it('gives each candle the high and low its wicks are drawn to, and the volume its bar draws', () => {
    // The bodies match each candle's open and close, so they give the price
    // scale; every wick ended elsewhere than the declared high and low, and
    // every candle carried a volume of 0 beside a volume bar.
    const [candleLayer, volumeLayer] = loadLayers('candlestick_multilayer.html');
    const candles = candleLayer.data as CandlestickPoint[];
    const selectors = candleLayer.selectors as CandlestickSelector;
    const bodies = marks(selectors.body as string);
    const lows = marks(selectors.wickLow as string);
    const highs = marks(selectors.wickHigh as string);

    // Two bodies far apart fix the scale: a price is `a + b * y`.
    const [first, last] = [0, candles.length - 1];
    const top = (index: number): number => Math.min(...pathYs(bodies[index]));
    const topPrice = (index: number): number => Math.max(candles[index].open ?? Number.NaN, candles[index].close);
    const b = (topPrice(last) - topPrice(first)) / (top(last) - top(first));
    const a = topPrice(first) - b * top(first);
    const price = (y: number): number => a + b * y;

    expect(bodies).toHaveLength(candles.length);
    expect(lows).toHaveLength(candles.length);
    expect(highs).toHaveLength(candles.length);
    for (const [index, candle] of candles.entries()) {
      expect(price(Math.max(...pathYs(lows[index])))).toBeCloseTo(candle.low, 1);
      expect(price(Math.min(...pathYs(highs[index])))).toBeCloseTo(candle.high, 1);
      expect(candle.volume).toBe((volumeLayer.data as BarPoint[])[index].y);
    }
  });

  it('draws each age band\'s label on the band\'s own bars', () => {
    // Bar k spans y 100 + 40k to 132 + 40k; its label sat at 148 + 40k, on
    // the top of the next band down, so the bar MAIDR outlined as "15-29"
    // carried the label "0-14".
    const [layer] = loadLayers('pyramid.html');
    const bands = (layer.data as SegmentedPoint[][])[0].map(point => String(point.y));
    const bars = marks(layer.selectors as string);
    const labels = marks('g[id=\'axis_y\'] text');

    const misplaced = labels.filter((label) => {
      // The rects run band by band, each band's two sides together.
      const bar = bars[2 * bands.indexOf(label.textContent ?? '')];
      const y = Number(label.getAttribute('y'));
      const from = Number(bar?.getAttribute('y'));
      return !(from < y && y <= from + Number(bar?.getAttribute('height')));
    }).map(label => label.textContent);

    expect(labels).toHaveLength(bands.length);
    expect(misplaced).toEqual([]);
  });

  it.each([
    ['manhattan.html'],
    ['volcano.html'],
  ])('gives %s the grid its braille display is drawn on', (page) => {
    // A scatter's points are brailled only in grid navigation, which needs
    // both axes' range and step; without them B answered "Braille is not
    // supported for plot type: manhattan", or volcano.
    const [layer] = loadLayers(page);
    const trace = TraceFactory.create(layer) as ScatterTrace;

    trace.setGridMode(true);
    const state = trace.state;

    expect(trace.supportsGridMode()).toBe(true);
    expect(state.empty || state.braille.empty).toBe(false);
    trace.dispose();
  });

  it('declares each line\'s x as the number its vertex is drawn at, which a layer switch carries', () => {
    // The lines are drawn on a numeric x axis at 1 to 10, and every second x
    // was declared as a string, "2" to "10". A layer switch carries a string
    // as a name, and the crossings layer names none of its points, so Page Up
    // from the lines' crossing at 8 entered that layer at its first point,
    // the crossing at 3.
    const spec = loadSpec('multiline_plot_intersection.html');
    const [subplot] = spec.subplots[0];
    const [lineLayer] = subplot.layers;
    const lines = (lineLayer.data as LinePoint[][]).map(points => points.map(point => point.x));
    const vertices = (lineLayer.selectors as string[]).map(selector => pathXs(marks(selector)[0]));
    // The first line's first and last vertices, at 1 and 10, fix the scale.
    const [from, to] = [vertices[0][0], vertices[0][vertices[0].length - 1]];
    const drawn = vertices.map(line => line.map(x => Math.round((1 + 9 * (x - from) / (to - from)) * 100) / 100));
    // A switch reads no outline, and jsdom has no SVG geometry to build one
    // from, so the model is built without the selectors.
    const unoutlined: Maidr = {
      ...spec,
      subplots: [[{ ...subplot, layers: subplot.layers.map(layer => ({ ...layer, selectors: undefined })) }]],
    };
    const context = new Context(new Figure(unoutlined));

    (context.active as Trace).moveToIndex(0, 7);
    context.stepTrace('UPWARD');
    const entered = (context.active as Trace).getCurrentXValue();
    context.stepTrace('DOWNWARD');
    const returned = (context.active as Trace).getCurrentXValue();

    expect(lines).toEqual(drawn);
    expect(entered).toBe(8);
    expect(returned).toBe(8);
    context.dispose();
  });
});
