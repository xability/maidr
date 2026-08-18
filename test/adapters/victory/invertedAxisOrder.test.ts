/**
 * A Victory chart on an inverted independent axis has to be read the way it is
 * drawn (#1018).
 *
 * `<VictoryAxis invertAxis />` draws the categories from the far end while
 * Victory keeps rendering its marks in data order, so a layer emitted as
 * written is announced as the mirror image of the chart.
 *
 * Measured on real Victory under `npm run dev:victory` in Chromium, with
 * `invertAxis` added to the independent axis of the bar example and nothing
 * else changed, for `Q1: 4200, Q2: 5800, Q3: 3900, Q4: 7100`:
 *
 *   x tick labels, left→right:  Q4, Q3, Q2, Q1
 *
 *   marks in DOM order    centre x    height    → which datum
 *           0               631        104        Q1
 *           1               530        144        Q2
 *           2               430         97        Q3
 *           3               329        176        Q4
 *
 * so the drawing is inverted and the DOM is not. The line, area, scatter and
 * stacked readings were measured to behave the same way; only the ones a
 * `string[]` of per-mark selectors can follow are turned round here, which is
 * what `REVERSIBLE_KINDS` names.
 */
import type { VictoryLayerInfo } from '@adapters/victory/types';
import type { BarPoint } from '@type/grammar';
import { extractVictoryLayers } from '@adapters/victory/converters';
import { tagLayerElements } from '@adapters/victory/selectors';
import { describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface VictoryStub {
  (props: Record<string, unknown>): null;
  displayName: string;
}

/**
 * A stand-in for a Victory component. Extraction reads only `displayName` and
 * the element props, so the real renderer is not needed.
 * @param displayName - The Victory component name to answer to
 * @returns The stub component
 */
function stub(displayName: string): VictoryStub {
  const component = (): null => null;
  component.displayName = displayName;
  return component as VictoryStub;
}

const VictoryChart = stub('VictoryChart');
const VictoryAxis = stub('VictoryAxis');
const VictoryBar = stub('VictoryBar');
const VictoryLine = stub('VictoryLine');

/** The categories in the order they are written. */
const LISTED = ['Q1', 'Q2', 'Q3', 'Q4'];
/** The same categories in the order an inverted axis draws them. */
const DRAWN = ['Q4', 'Q3', 'Q2', 'Q1'];

const DATA = LISTED.map((x, i) => ({ x, y: (i + 1) * 10 }));

/**
 * The layers a chart converts to.
 * @param options - What the chart declares
 * @param options.invert - Whether the independent axis is inverted
 * @param options.dependentInvert - Whether the *dependent* axis is inverted
 * @param options.label - A label for the independent axis, when it has one
 * @param options.line - Draw a `VictoryLine` instead of a `VictoryBar`
 * @param options.horizontal - Turn the chart on its side
 * @returns The extracted layers
 */
function layersFor(options: {
  invert?: boolean;
  dependentInvert?: boolean;
  label?: string;
  line?: boolean;
  horizontal?: boolean;
} = {}): VictoryLayerInfo[] {
  const mark = options.line ? VictoryLine : VictoryBar;
  return extractVictoryLayers(
    createElement(
      VictoryChart,
      options.horizontal ? { horizontal: true } : null,
      createElement(VictoryAxis, {
        ...(options.invert ? { invertAxis: true } : {}),
        ...(options.label ? { label: options.label } : {}),
      }),
      createElement(VictoryAxis, {
        dependentAxis: true,
        ...(options.dependentInvert ? { invertAxis: true } : {}),
      }),
      createElement(mark, { data: DATA }),
    ),
  );
}

/** The categories of a bar layer, in the order it emits them. */
function categoriesOf(layer: VictoryLayerInfo): unknown[] {
  return (layer.data.points as BarPoint[]).map(p => p.x);
}

/**
 * A Victory-style panel: one `<path role="presentation">` per datum, in the
 * order Victory renders them, which is data order either way round.
 * @param count - How many marks to draw
 * @returns The container and its document
 */
function buildContainer(count: number): { container: HTMLElement; doc: Document } {
  const dom = new JSDOM('<!doctype html><body><div id="mv"></div></body>');
  const doc = dom.window.document as Document;
  const container = doc.getElementById('mv') as HTMLElement;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('role', 'img');
  for (let i = 0; i < count; i++) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('role', 'presentation');
    // Stamped so a resolved selector can say which datum it found.
    path.setAttribute('data-datum', LISTED[i]);
    svg.appendChild(path);
  }
  container.appendChild(svg);
  return { container, doc };
}

describe('a victory chart on an inverted independent axis', () => {
  it('leads with the category drawn first', () => {
    // Before the fix this was ['Q1', 'Q2', 'Q3', 'Q4'] — the exact reverse of
    // what the chart draws.
    expect(categoriesOf(layersFor({ invert: true })[0])).toEqual(DRAWN);
  });

  it('carries each value with its own category', () => {
    const points = layersFor({ invert: true })[0].data.points as BarPoint[];

    expect(points.find(p => p.x === 'Q1')?.y).toBe(10);
    expect(points.find(p => p.x === 'Q4')?.y).toBe(40);
  });

  it('reads an inverted axis that carries no label', () => {
    // The label is what the walk used to be for, and it returned early when
    // there was none. An axis is commonly inverted without being labelled.
    expect(categoriesOf(layersFor({ invert: true })[0])).toEqual(DRAWN);
  });

  it('still reads the label when there is one', () => {
    expect(layersFor({ invert: true, label: 'Quarter' })[0].xAxisLabel).toBe('Quarter');
  });

  it('leaves an ordinary chart alone', () => {
    expect(categoriesOf(layersFor()[0])).toEqual(LISTED);
    expect(layersFor()[0].categoriesReversed).toBeUndefined();
  });

  it('ignores an inverted dependent axis', () => {
    // Inverting the value axis turns the magnitudes over and moves no
    // category. Reading it here would reorder a chart that did not move.
    expect(categoriesOf(layersFor({ dependentInvert: true })[0])).toEqual(LISTED);
  });

  it('turns a horizontal chart round too', () => {
    // `horizontal` swaps which screen axis the categories run along, but not
    // which `<VictoryAxis>` declares them: the independent one is still the
    // element without `dependentAxis`. Measured only on a vertical bar, so
    // this pins that the fix does not quietly depend on the orientation.
    const layer = layersFor({ invert: true, horizontal: true })[0];

    expect(categoriesOf(layer)).toEqual(DRAWN);
    expect(layer.orientation).toBe('horz');
  });

  it('leaves a horizontal chart alone when nothing is inverted', () => {
    const layer = layersFor({ horizontal: true })[0];

    expect(categoriesOf(layer)).toEqual(LISTED);
    expect(layer.categoriesReversed).toBeUndefined();
  });

  it('leaves a line alone, whose order the adapter cannot give', () => {
    // A line is one `<path>`, and `LineTrace` pairs vertex i with point i.
    // Both are in data order and so agree; reversing the payload alone would
    // break that agreement rather than fix anything (#1007).
    const layer = layersFor({ invert: true, line: true })[0];

    expect(layer.categoriesReversed).toBeUndefined();
    expect(layer.data.kind).toBe('line');
  });
});

describe('the highlight follows the categories', () => {
  it('names each mark instead of leaving one selector to resolve', () => {
    // One shared attribute resolves in DOM order, which is data order — so a
    // reversed payload would announce Q4 and outline Q1.
    const { container } = buildContainer(4);
    const svg = container.querySelector('svg') as SVGElement;
    const selectors = tagLayerElements(svg, layersFor({ invert: true })[0], 0, new Set(), '');

    expect(Array.isArray(selectors)).toBe(true);
    expect(selectors).toHaveLength(4);
  });

  it('points selector 0 at the mark the reading leads with', () => {
    const { container, doc } = buildContainer(4);
    const svg = container.querySelector('svg') as SVGElement;
    const selectors = tagLayerElements(
      svg,
      layersFor({ invert: true })[0],
      0,
      new Set(),
      '',
    ) as string[];

    // The payload leads with Q4, so the first selector must find Q4's mark —
    // which Victory drew last.
    expect(doc.querySelector(selectors[0])?.getAttribute('data-datum')).toBe('Q4');
    expect(doc.querySelector(selectors[3])?.getAttribute('data-datum')).toBe('Q1');
  });

  it('gives every category its own selector', () => {
    const { container, doc } = buildContainer(4);
    const svg = container.querySelector('svg') as SVGElement;
    const layer = layersFor({ invert: true })[0];
    const selectors = tagLayerElements(svg, layer, 0, new Set(), '') as string[];
    const found = selectors.map(s => doc.querySelector(s)?.getAttribute('data-datum'));

    expect(found).toEqual(categoriesOf(layer));
  });

  it('leaves no shared attribute behind to select them wrongly', () => {
    // The shared attribute is what a single selector resolves positionally.
    // Left on a reversed layer it would be a second, oppositely-ordered way to
    // reach the same marks — harmless only until something used it.
    const { container } = buildContainer(4);
    const svg = container.querySelector('svg') as SVGElement;
    tagLayerElements(svg, layersFor({ invert: true })[0], 0, new Set(), '');

    expect(svg.querySelectorAll('[data-maidr-victory-0]')).toHaveLength(0);
    expect(svg.querySelectorAll('[data-maidr-victory-0-0]')).toHaveLength(1);
  });

  it('keeps the shared attribute on an ordinary chart', () => {
    const { container } = buildContainer(4);
    const svg = container.querySelector('svg') as SVGElement;
    tagLayerElements(svg, layersFor()[0], 0, new Set(), '');

    expect(svg.querySelectorAll('[data-maidr-victory-0]')).toHaveLength(4);
  });

  it('leaves an ordinary chart on its single selector', () => {
    // Nothing to re-point when the reading is already in DOM order, and a
    // list of four would be four things able to drift instead of one.
    const { container } = buildContainer(4);
    const svg = container.querySelector('svg') as SVGElement;
    const selectors = tagLayerElements(svg, layersFor()[0], 0, new Set(), '');

    expect(typeof selectors).toBe('string');
  });
});
