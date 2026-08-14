import { bindD3Gauge } from '@adapters/d3/binders/gauge';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';
import { withPageDocument } from './pageDocument';

/**
 * Builds an SVG holding a bullet chart's measure bar with the given datum
 * bound to it, alongside the range band a bullet is drawn over — which carries
 * no data and must not be what the binder reads.
 */
function buildGaugeSvg(datum: unknown): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="gg-svg"></svg>`);
  const doc = dom.window.document;
  const svg = doc.querySelector('svg') as unknown as SVGElement;

  const band = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  band.setAttribute('class', 'band');
  svg.appendChild(band);

  const measure = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  measure.setAttribute('class', 'measure');
  (measure as unknown as { __data__: unknown }).__data__ = datum;
  svg.appendChild(measure);

  return svg;
}

const BANDS = [
  { to: 50, label: 'poor' },
  { to: 75, label: 'ok' },
  { to: 100, label: 'good' },
];

describe('bindD3Gauge', () => {
  test('emits the single object a gauge draws, not an array of one', () => {
    const svg = buildGaugeSvg({ value: 73 });

    const result = bindD3Gauge(svg, {
      selector: 'rect.measure',
      title: 'Conversion Rate against Target',
      axes: { x: 'Measure', y: 'Percent' },
      label: 'Conversion',
      min: 0,
      max: 100,
      target: 80,
      bands: BANDS,
    });

    expect(result.layer.type).toBe(TraceType.GAUGE);
    expect(result.layer.data).toEqual({
      value: 73,
      min: 0,
      max: 100,
      label: 'Conversion',
      target: 80,
      bands: BANDS,
    });
  });

  test('takes the measure from a bare numeric datum', () => {
    // A gauge is routinely joined against the number it displays, in which
    // case there is no key to name.
    const svg = buildGaugeSvg(42);

    const result = bindD3Gauge(svg, { selector: 'rect.measure', min: 0, max: 60 });

    expect(result.layer.data).toEqual({ value: 42, min: 0, max: 60 });
  });

  test('infers the measure from an aliased key', () => {
    const svg = buildGaugeSvg({ actual: 3.4, label: 'ignored' });

    const result = bindD3Gauge(svg, { selector: 'rect.measure', min: 0, max: 5 });

    expect(result.layer.data).toEqual({ value: 3.4, min: 0, max: 5 });
  });

  test('honours an explicit accessor even over a bare numeric datum', () => {
    const svg = buildGaugeSvg(42);

    const result = bindD3Gauge(svg, {
      selector: 'rect.measure',
      value: (d: unknown) => (d as number) / 2,
      min: 0,
      max: 60,
    });

    expect(result.layer.data).toEqual({ value: 21, min: 0, max: 60 });
  });

  test('leaves the annotations out when the chart has none', () => {
    // Absent rather than empty: the trace announces the band a value lands in
    // only when bands were declared, and nothing is invented for it.
    const svg = buildGaugeSvg({ value: 7 });

    const result = bindD3Gauge(svg, { selector: 'rect.measure', min: 0, max: 10 });

    expect(result.layer.data).toEqual({ value: 7, min: 0, max: 10 });
  });

  test('highlights the mark the value is drawn as, scoped to the SVG', () => {
    const svg = buildGaugeSvg({ value: 73 });

    const result = bindD3Gauge(svg, { selector: 'rect.measure', min: 0, max: 100 });

    expect(result.layer.selectors).toBe('#gg-svg rect.measure');
    const matched = svg.ownerDocument.querySelectorAll(result.layer.selectors as string);
    expect(matched).toHaveLength(1);
  });

  test('throws an actionable error when the selector matches no value mark', () => {
    const svg = buildGaugeSvg({ value: 73 });

    expect(() => bindD3Gauge(svg, { selector: 'path.needle', min: 0, max: 100 }))
      .toThrow(/gauge value/);
  });
});

describe('core-model integration', () => {
  test('the emitted layer constructs a navigable Figure', () => {
    const svg = buildGaugeSvg({ value: 73 });
    const result = bindD3Gauge(svg, {
      selector: 'rect.measure',
      title: 'Conversion Rate against Target',
      label: 'Conversion',
      min: 0,
      max: 100,
      target: 80,
      bands: BANDS,
    });

    withPageDocument(svg, () => {
      const figure = new Figure(result.maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.GAUGE]);
    });
  });
});
