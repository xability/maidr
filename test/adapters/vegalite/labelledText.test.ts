import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/**
 * A `text` mark read as nothing, so a labelled scatter announced nothing
 * (#1124).
 *
 * `resolveTraceType` had no `text` case, so the mark fell to
 * `default: return null` and the figure came back with no layers. That is
 * the country-names-against-GDP chart, and the one shape where the mark
 * carries something no other mark can -- which is what `ScatterPoint.label`
 * exists for, and what its own doc names `Plot.text` as the reason for.
 *
 * The rule is #1106's, settled for the Observable side and for the same
 * reason here: only on two continuous scales. A `text` on a categorical
 * axis is a value written over a bar or into a heatmap cell, and the mark
 * beside it already announces that number; reading it would announce every
 * count twice.
 *
 * The layered case is the one that needed a second rule. Vega-Lite labels a
 * scatter with `layer: [{mark: 'point'}, {mark: 'text'}]` on the same two
 * channels, and both halves pass the test above -- so the label layer is
 * declined, leaving that chart reading exactly as it did before.
 */

const CITIES = {
  values: [
    { city: 'Aa', pop: 3, area: 10 },
    { city: 'Bb', pop: 5, area: 20 },
    { city: 'Cc', pop: 2, area: 30 },
  ],
};

function layersOf(spec: VegaLiteSpec): MaidrLayer[] {
  return vegaLiteToMaidr(spec).subplots[0][0].layers;
}

function onlyLayer(spec: VegaLiteSpec): MaidrLayer {
  const layers = layersOf(spec);
  expect(layers).toHaveLength(1);
  return layers[0];
}

/** A labelled scatter: two continuous axes and a name at each point. */
const labelledScatter: VegaLiteSpec = {
  data: CITIES,
  mark: 'text',
  encoding: {
    x: { field: 'area', type: 'quantitative', title: 'Area' },
    y: { field: 'pop', type: 'quantitative', title: 'Population' },
    text: { field: 'city', type: 'nominal' },
  },
};

describe('vega-Lite text marks', () => {
  it('reads a standalone text mark as the labelled scatter it draws', () => {
    const layer = onlyLayer(labelledScatter);

    expect(layer.type).toBe(TraceType.SCATTER);
    expect(layer.data as ScatterPoint[]).toEqual([
      { x: 10, y: 3, label: 'Aa' },
      { x: 20, y: 5, label: 'Bb' },
      { x: 30, y: 2, label: 'Cc' },
    ]);
  });

  it('names the axes the two coordinates were drawn against', () => {
    const layer = onlyLayer(labelledScatter);

    expect(layer.axes?.x?.label).toBe('Area');
    expect(layer.axes?.y?.label).toBe('Population');
  });

  it('highlights through the element Vega draws a text mark as', () => {
    // Asserted against a rendered group rather than against the selector
    // string. Vega draws a `text` mark as a `<text>` each, where every mark
    // this adapter reached before is a `<path>` -- and a selector naming the
    // wrong tag matches nothing, which costs the layer its highlighting and
    // nothing else, so `toContain('mark-text')` passed either way.
    //
    // The shape is the codebase's own: `facets.ts` reads a facet header out
    // of `g.mark-text.role-title-text text`.
    const layer = onlyLayer(labelledScatter);

    const dom = new JSDOM(
      '<svg><g class="mark-text role-mark marks">'
      + '<text>Aa</text><text>Bb</text><text>Cc</text>'
      + '</g></svg>',
    );

    const drawn = dom.window.document.querySelectorAll(layer.selectors as string);
    expect(Array.from(drawn).map(node => node.textContent))
      .toEqual(['Aa', 'Bb', 'Cc']);
  });

  it('leaves a text mark with nothing written in it unread', () => {
    // Vega-Lite draws empty strings without a `text` channel, so there is
    // no name to carry and nothing the point mark would not say better.
    expect(layersOf({
      data: CITIES,
      mark: 'text',
      encoding: {
        x: { field: 'area', type: 'quantitative' },
        y: { field: 'pop', type: 'quantitative' },
      },
    })).toHaveLength(0);
  });

  it('leaves a value written over a bar unread', () => {
    // One categorical positional channel: this is a bar's own count printed
    // at the top of it. The bar mark announces that number already.
    expect(layersOf({
      data: CITIES,
      mark: 'text',
      encoding: {
        x: { field: 'city', type: 'nominal' },
        y: { field: 'pop', type: 'quantitative' },
        text: { field: 'pop', type: 'quantitative' },
      },
    })).toHaveLength(0);
  });

  it('leaves a heatmap cell label unread', () => {
    // Both channels categorical -- the number in a cell, which the `rect`
    // layer beside it carries as the cell's value.
    expect(layersOf({
      data: CITIES,
      mark: 'text',
      encoding: {
        x: { field: 'city', type: 'nominal' },
        y: { field: 'city', type: 'nominal' },
        text: { field: 'pop', type: 'quantitative' },
      },
    })).toHaveLength(0);
  });

  it('reads a labelled scatter as one layer, not two', () => {
    // The layered spelling: a `point` and the `text` that names it, over the
    // same two channels. Both pass the labelled-scatter test on their own,
    // so without the decline this figure gains a second scatter announcing
    // the same three points.
    const layers = layersOf({
      data: CITIES,
      layer: [
        {
          mark: 'point',
          encoding: {
            x: { field: 'area', type: 'quantitative' },
            y: { field: 'pop', type: 'quantitative' },
          },
        },
        {
          mark: 'text',
          encoding: {
            x: { field: 'area', type: 'quantitative' },
            y: { field: 'pop', type: 'quantitative' },
            text: { field: 'city', type: 'nominal' },
          },
        },
      ],
    });

    expect(layers.map(layer => layer.type)).toEqual([TraceType.SCATTER]);
  });

  it('declines the label layer wherever it is written', () => {
    // Drawn first rather than last, which is how a spec puts labels behind
    // their marks. Told by the fields, so the order cannot matter.
    const layers = layersOf({
      data: CITIES,
      layer: [
        {
          mark: 'text',
          encoding: {
            x: { field: 'area', type: 'quantitative' },
            y: { field: 'pop', type: 'quantitative' },
            text: { field: 'city', type: 'nominal' },
          },
        },
        {
          mark: 'point',
          encoding: {
            x: { field: 'area', type: 'quantitative' },
            y: { field: 'pop', type: 'quantitative' },
          },
        },
      ],
    });

    expect(layers.map(layer => layer.type)).toEqual([TraceType.SCATTER]);
  });

  it('keeps a text layer that charts something of its own', () => {
    // Different channels from the layer beside it, so it annotates nothing:
    // it is a chart stacked on another chart, and both are read.
    const layers = layersOf({
      data: CITIES,
      layer: [
        {
          mark: 'point',
          encoding: {
            x: { field: 'area', type: 'quantitative' },
            y: { field: 'pop', type: 'quantitative' },
          },
        },
        {
          mark: 'text',
          encoding: {
            x: { field: 'pop', type: 'quantitative' },
            y: { field: 'area', type: 'quantitative' },
            text: { field: 'city', type: 'nominal' },
          },
        },
      ],
    });

    expect(layers.map(layer => layer.type)).toEqual([
      TraceType.SCATTER,
      TraceType.SCATTER,
    ]);
  });

  it('leaves an ordinary scatter without labels it never had', () => {
    // `label` is emitted only when a `text` channel names a field, so a
    // `point` mark is unchanged -- the field is read from the encoding both
    // marks share an extractor for.
    const layer = onlyLayer({
      data: CITIES,
      mark: 'point',
      encoding: {
        x: { field: 'area', type: 'quantitative' },
        y: { field: 'pop', type: 'quantitative' },
      },
    });

    expect(layer.data as ScatterPoint[]).toEqual([
      { x: 10, y: 3 },
      { x: 20, y: 5 },
      { x: 30, y: 2 },
    ]);
  });

  it('leaves an image mark unread', () => {
    // A picture at a position carries no magnitude to announce, so `null`
    // is the right answer and this pins that the sweep did not give it one.
    expect(layersOf({
      data: CITIES,
      mark: 'image',
      encoding: {
        x: { field: 'area', type: 'quantitative' },
        y: { field: 'pop', type: 'quantitative' },
      },
    })).toHaveLength(0);
  });
});

describe('a text layer that labels another', () => {
  const XY = {
    x: { field: 'area', type: 'quantitative' as const },
    y: { field: 'pop', type: 'quantitative' as const },
  };
  const NAMES = { field: 'city', type: 'nominal' as const };

  function pointsOf(spec: VegaLiteSpec): ScatterPoint[] {
    return onlyLayer(spec).data as ScatterPoint[];
  }

  it('gives its names to the points it labels', () => {
    // The follow-up #1124 recorded and deliberately left out of #1125:
    // declining the overlay left the chart reading as it always had, which
    // is a scatter whose points are nameless. Vega-Lite's own way of
    // labelling a scatter is this layer pair, so those names are the whole
    // reason the second layer was written.
    expect(pointsOf({
      data: CITIES,
      layer: [
        { mark: 'point', encoding: XY },
        { mark: 'text', encoding: { ...XY, text: NAMES } },
      ],
    })).toEqual([
      { x: 10, y: 3, label: 'Aa' },
      { x: 20, y: 5, label: 'Bb' },
      { x: 30, y: 2, label: 'Cc' },
    ]);
  });

  it('does so wherever the label layer is written', () => {
    // Labels behind their marks rather than over them. Told by the fields,
    // so the order cannot matter -- the same reason the decline is
    // order-independent.
    expect(pointsOf({
      data: CITIES,
      layer: [
        { mark: 'text', encoding: { ...XY, text: NAMES } },
        { mark: 'point', encoding: XY },
      ],
    })).toEqual([
      { x: 10, y: 3, label: 'Aa' },
      { x: 20, y: 5, label: 'Bb' },
      { x: 30, y: 2, label: 'Cc' },
    ]);
  });

  it('leaves a bar chart\'s labels where they were', () => {
    // A `text` over a bar writes the bar's own value, and the bar already
    // announces it. The layer is still declined and nothing is moved --
    // `ScatterPoint.label` is the only field that carries a name, so there
    // is nowhere on a bar for one to go and nothing gained by inventing
    // one.
    const layers = layersOf({
      data: CITIES,
      layer: [
        {
          mark: 'bar',
          encoding: { x: { field: 'city', type: 'nominal' }, y: XY.y },
        },
        {
          mark: 'text',
          encoding: {
            x: { field: 'city', type: 'nominal' },
            y: XY.y,
            text: NAMES,
          },
        },
      ],
    });

    expect(layers.map(layer => layer.type)).toEqual([TraceType.BAR]);
    expect(layers[0].data).toEqual([
      { x: 'Aa', y: 3 },
      { x: 'Bb', y: 5 },
      { x: 'Cc', y: 2 },
    ]);
  });

  it('leaves a line chart alone too', () => {
    const layers = layersOf({
      data: CITIES,
      layer: [
        { mark: 'line', encoding: XY },
        { mark: 'text', encoding: { ...XY, text: NAMES } },
      ],
    });

    expect(layers.map(layer => layer.type)).toEqual([TraceType.LINE]);
  });

  it('claims both of two label layers, and the last one names the points', () => {
    // A degenerate spec, measured rather than reasoned about. Two `text`
    // layers over one mark: both are claimed, so the figure is still one
    // layer rather than three, and `names` is keyed by the labelled layer
    // so the later one wins. Not reconciled -- there is no right answer to
    // "which of two names is the name" -- but pinned so it is known.
    const layers = layersOf({
      data: CITIES,
      layer: [
        { mark: 'point', encoding: XY },
        { mark: 'text', encoding: { ...XY, text: NAMES } },
        {
          mark: 'text',
          encoding: { ...XY, text: { field: 'pop', type: 'nominal' } },
        },
      ],
    });

    expect(layers).toHaveLength(1);
    expect((layers[0].data as ScatterPoint[])[0].label).toBe('3');
  });

  it('adds nothing when the label layer names no field', () => {
    // Still declined -- it draws nothing to read -- and the points it sat
    // over are unchanged rather than gaining an empty name.
    expect(pointsOf({
      data: CITIES,
      layer: [
        { mark: 'point', encoding: XY },
        { mark: 'text', encoding: XY },
      ],
    })).toEqual([
      { x: 10, y: 3 },
      { x: 20, y: 5 },
      { x: 30, y: 2 },
    ]);
  });
});
