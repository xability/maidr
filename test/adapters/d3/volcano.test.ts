import type { VolcanoPoint } from '@type/grammar';
import { bindD3Scatter, bindD3Volcano } from '@adapters/d3/binders/scatter';
import { afterAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

/**
 * Builds an SVG holding one `circle.gene` per datum, the way
 * `selectAll('circle.gene').data(genes).join('circle')` would leave it.
 */
function buildVolcanoSvg(data: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="vc-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;
  for (const datum of data) {
    const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'gene');
    (circle as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(circle);
  }
  return svg;
}

const GENES = [
  { lfc: 2.4, logP: 14.1, gene: 'TP53', regulation: 'up' },
  { lfc: -3.1, logP: 9.8, gene: 'MYC', regulation: 'down' },
  { lfc: 0.2, logP: 0.6, gene: 'ACTB', regulation: 'ns' },
];

// The binder warns when no gene name resolves; silence it at file scope so the
// expected-warning case does not print on every run.
const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warn.mockClear();
});

afterAll(() => {
  warn.mockRestore();
});

describe('bindD3Volcano', () => {
  test('carries the gene name and the side it falls on', () => {
    const svg = buildVolcanoSvg(GENES);

    const result = bindD3Volcano(svg, {
      selector: 'circle.gene',
      title: 'Differential Expression',
      axes: { x: 'log2 fold change', y: '-log10(p)' },
      x: 'lfc',
      y: 'logP',
      label: 'gene',
      group: 'regulation',
    });

    expect(result.layer.type).toBe(TraceType.VOLCANO);
    // Identity is the payload on this chart: the coordinates alone answer the
    // question a reader can already see the shape of.
    expect(result.layer.data).toEqual([
      { x: 2.4, y: 14.1, label: 'TP53', group: 'up' },
      { x: -3.1, y: 9.8, label: 'MYC', group: 'down' },
      { x: 0.2, y: 0.6, label: 'ACTB', group: 'ns' },
    ]);
  });

  test('infers the gene name from the datum\'s own key names', () => {
    const svg = buildVolcanoSvg([{ x: 1.2, y: 4, gene: 'BRCA1' }]);

    const result = bindD3Volcano(svg, { selector: 'circle.gene' });

    expect(result.layer.data).toEqual([{ x: 1.2, y: 4, label: 'BRCA1' }]);
  });

  test('declares both cutoffs a volcano is read through', () => {
    const svg = buildVolcanoSvg(GENES);

    const result = bindD3Volcano(svg, {
      selector: 'circle.gene',
      x: 'lfc',
      y: 'logP',
      significance: 1.3,
      effect: 1,
    });

    // The effect cutoff is what makes it a volcano rather than a Manhattan:
    // a gene matters when its change is both large and significant.
    expect(result.layer.thresholdOptions).toEqual({ significance: 1.3, effect: 1 });
  });

  test('emits no threshold at all when none was declared', () => {
    const svg = buildVolcanoSvg(GENES);

    const result = bindD3Volcano(svg, { selector: 'circle.gene', x: 'lfc', y: 'logP' });

    expect(result.layer.thresholdOptions).toBeUndefined();
  });

  test('warns, but still binds, when no point names a gene', () => {
    const svg = buildVolcanoSvg([{ x: 1, y: 2 }, { x: 3, y: 4 }]);

    const result = bindD3Volcano(svg, { selector: 'circle.gene' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/label/);
    // The chart still reads as a scatter with a cutoff; refusing to bind would
    // leave the reader with nothing at all.
    expect(result.layer.data).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
  });

  test('stays quiet when even one point names a gene', () => {
    const svg = buildVolcanoSvg([{ x: 1, y: 2, gene: 'TP53' }, { x: 3, y: 4 }]);

    const result = bindD3Volcano(svg, { selector: 'circle.gene' });

    expect(warn).not.toHaveBeenCalled();
    const [, unnamed] = result.layer.data as VolcanoPoint[];
    expect(unnamed).toEqual({ x: 3, y: 4 });
  });

  test('highlights the points, scoped to the SVG', () => {
    const svg = buildVolcanoSvg(GENES);

    const result = bindD3Volcano(svg, { selector: 'circle.gene', x: 'lfc', y: 'logP' });

    expect(result.layer.selectors).toBe('#vc-svg circle.gene');
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength(GENES.length);
  });
});

describe('bindD3Scatter alongside it', () => {
  test('stays a scatter, and reads no gene name off a datum that has one', () => {
    const svg = buildVolcanoSvg([{ x: 1, y: 2, gene: 'TP53' }]);

    const result = bindD3Scatter(svg, { selector: 'circle.gene' });

    expect(result.layer.type).toBe(TraceType.SCATTER);
    expect(result.layer.data).toEqual([{ x: 1, y: 2 }]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildVolcanoSvg(GENES);
    const result = bindD3Volcano(svg, {
      selector: 'circle.gene',
      title: 'Differential Expression',
      x: 'lfc',
      y: 'logP',
      label: 'gene',
      significance: 1.3,
      effect: 1,
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.VOLCANO]);
    });
  });
});
