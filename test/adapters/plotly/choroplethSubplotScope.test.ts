/**
 * @jest-environment jsdom
 */

/**
 * A choropleth layer's selectors have to name regions on its own map and no
 * others.
 *
 * Every region selector was scoped by `.geolayer > g.geo.${geoId}`, which is
 * a class *token* match. Measured in Chromium, plotly writes a geo subplot's
 * class attribute as `"geo " + id`, so the first subplot's attribute is the
 * doubled string `class="geo geo"` — whose `classList` is the single token
 * `["geo"]`, a token every other geo subplot carries too (`class="geo geo2"`
 * → `["geo", "geo2"]`).
 *
 * So `.geolayer > g.geo` and `.geolayer > g.geo.geo` are the same selector,
 * and on a two-map figure both matched 2 of 2 subplots. Measured in Chromium
 * on three maps — `geo`, `geo2`, `geo10` — carrying two regions each:
 *
 *   selector                                 matched   __data__.loc
 *   …g.geo.geo …:nth-of-type(1)              3         ['USA', 'FRA', 'IND']
 *   …g.geo.geo2 …:nth-of-type(1)             1         ['FRA']
 *   …g.geo.geo10 …:nth-of-type(1)            1         ['IND']
 *   …g[class='geo geo'] …:nth-of-type(1)     1         ['USA']
 *
 * Only the doubled id collapses to an ambiguous token, so only the layer drawn
 * on `geo` is wrong — and `geo10` collides with neither of the ids it is
 * prefixed by, because attribute matching is whole-string.
 *
 * `ChoroplethTrace.mapToSvgElements` compares the resolved elements against
 * the declared regions and returns null on a mismatch, so that layer's outline
 * went missing altogether rather than landing on the wrong country. One map on
 * a figure silently loses its highlight while its neighbours keep theirs,
 * which is why nothing upstream flagged it.
 *
 * The fixture below is the measured DOM: the containers carry the attributes
 * plotly writes, doubled token and all, so the token form really does
 * over-match here the way it does in a browser.
 */

import type { PlotlyCalcData, PlotlyFullLayout, PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import type { MaidrLayer } from '@type/grammar';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { afterEach, describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One map's worth of regions: the codes plotly resolved, in declared order. */
interface GeoMap {
  /** The geo subplot it is drawn on (`geo`, `geo2`, …). */
  id: string;
  /** The location codes, in the order the trace declared them. */
  locations: string[];
}

function element(tag: string, className: string): SVGElement {
  const node = document.createElementNS(SVG_NS, tag) as SVGElement;
  // `setAttribute` rather than `className`, because the whole point is the
  // attribute plotly writes: `classList` collapses `"geo geo"` to one token,
  // and building the fixture through the token list would lose the doubling
  // that this test exists to reproduce.
  node.setAttribute('class', className);
  return node;
}

/**
 * The SVG plotly draws for a set of geo subplots.
 *
 * `.geolayer`'s children are in geo-id order — measured, and independent of
 * trace declaration order and of on-screen domain.
 *
 * @param maps - The maps, in geo-id order
 * @returns The `.geolayer` group
 */
function geoLayer(maps: GeoMap[]): SVGElement {
  const layer = element('g', 'geolayer');
  for (const map of maps) {
    // The doubled attribute: `"geo " + id`, so `geo` reads `"geo geo"`.
    const subplot = element('g', `geo ${map.id}`);
    const backplot = element('g', 'backplot');
    const choroplethlayer = element('g', 'choroplethlayer');
    const trace = element('g', 'trace choropleth');
    for (const location of map.locations) {
      const path = element('path', 'choroplethlocation');
      // Stands in for the `__data__.loc` plotly binds, which is what named
      // each over-matched element in the browser measurement.
      path.setAttribute('data-loc', location);
      trace.appendChild(path);
    }
    choroplethlayer.appendChild(trace);
    backplot.appendChild(choroplethlayer);
    subplot.appendChild(backplot);
    layer.appendChild(subplot);
  }
  return layer;
}

/** A choropleth trace over the given codes, drawn on the given subplot. */
function choropleth(id: string, locations: string[]): PlotlyTrace {
  return {
    type: 'choropleth',
    locations,
    z: locations.map((_, index) => index + 1),
    colorbar: { title: { text: 'Value' } },
    ...(id === 'geo' ? {} : { geo: id }),
  } as unknown as PlotlyTrace;
}

/** What plotly leaves once the map has been projected. */
function calc(locations: string[]): PlotlyCalcData[] {
  return locations.map((loc, index) =>
    ({ loc, z: index + 1, ct: [index, index] }) as PlotlyCalcData);
}

/**
 * A rendered plotly div drawing one choropleth per map.
 *
 * @param maps - The maps, in geo-id order
 * @returns The graph div, with its geo SVG in the document
 */
function graphDiv(maps: GeoMap[]): PlotlyGraphDiv {
  const div = document.createElement('div');
  div.id = 'chart';
  div.className = 'js-plotly-plot';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  svg.appendChild(geoLayer(maps));
  div.appendChild(svg);
  document.body.appendChild(div);

  const layout: PlotlyFullLayout = {};
  const span = 1 / maps.length;
  for (const [index, map] of maps.entries()) {
    (layout as Record<string, unknown>)[map.id] = {
      domain: { x: [index * span, (index + 1) * span], y: [0, 1] },
    };
  }

  const gd = div as PlotlyGraphDiv;
  gd._fullData = maps.map(map => choropleth(map.id, map.locations));
  gd._fullLayout = layout;
  gd.calcdata = maps.map(map => calc(map.locations));
  return gd;
}

/** The choropleth layers a figure converts to, one per map. */
function layersFor(maps: GeoMap[]): MaidrLayer[] {
  const maidr = extractPlotlyData(graphDiv(maps));
  expect(maidr).not.toBeNull();
  return maidr!.subplots[0]
    .map(panel => panel.layers[0])
    .filter(layer => layer.type === TraceType.CHOROPLETH);
}

/** Every element one layer's selectors resolve to, named by its location. */
function resolved(layer: MaidrLayer): string[] {
  const selectors = layer.selectors as string[];
  return selectors.flatMap(one =>
    [...document.querySelectorAll(one)]
      .map(element => element.getAttribute('data-loc') ?? '?'));
}

const NORTH = { id: 'geo', locations: ['USA', 'CAN', 'MEX'] };
const EUROPE = { id: 'geo2', locations: ['FRA', 'DEU', 'ITA'] };

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the measured DOM this is scoped against', () => {
  it('gives the first geo subplot a doubled class attribute', () => {
    graphDiv([NORTH, EUROPE]);
    const containers = [...document.querySelectorAll('.geolayer > g')];

    expect(containers.map(one => one.getAttribute('class')))
      .toEqual(['geo geo', 'geo geo2']);
    // The doubling collapses in the token list, which is the whole defect.
    expect([...containers[0].classList]).toEqual(['geo']);
    expect([...containers[1].classList]).toEqual(['geo', 'geo2']);
  });

  it('matches every subplot from the token form the selector used to use', () => {
    graphDiv([NORTH, EUROPE]);

    // Both of these are the same selector, and both name both maps.
    expect(document.querySelectorAll('.geolayer > g.geo')).toHaveLength(2);
    expect(document.querySelectorAll('.geolayer > g.geo.geo')).toHaveLength(2);
    // The attribute form names one. Whole-string matching, so no prefix
    // collision either.
    expect(document.querySelectorAll('.geolayer > g[class=\'geo geo\']')).toHaveLength(1);
    expect(document.querySelectorAll('.geolayer > g[class=\'geo geo2\']')).toHaveLength(1);
  });

  it('leaves the ids that are not doubled unambiguous', () => {
    // The asymmetry the measurement found, and the reason this went unseen:
    // only `geo` collapses. A figure's other maps resolved correctly under the
    // token form, so the bug shows as one map losing its outline rather than
    // as a map-wide failure anyone would chase.
    graphDiv([NORTH, EUROPE, { id: 'geo10', locations: ['IND', 'AUS'] }]);

    expect(document.querySelectorAll('.geolayer > g.geo.geo')).toHaveLength(3);
    expect(document.querySelectorAll('.geolayer > g.geo.geo2')).toHaveLength(1);
    expect(document.querySelectorAll('.geolayer > g.geo.geo10')).toHaveLength(1);
  });
});

describe('a figure with two geo subplots', () => {
  it('resolves each map\'s selectors to that map\'s regions alone', () => {
    // The regression. Under the token form the `geo` layer's three selectors
    // resolved six elements — ['USA', 'FRA', 'CAN', 'DEU', 'MEX', 'ITA'] —
    // and that layer lost its highlight on the count gate. `geo2` was already
    // correct, which is exactly why the failure was easy to miss.
    const [north, europe] = layersFor([NORTH, EUROPE]);

    expect(resolved(north)).toEqual(['USA', 'CAN', 'MEX']);
    expect(resolved(europe)).toEqual(['FRA', 'DEU', 'ITA']);
  });

  it('gives each region exactly one element', () => {
    // What `ChoroplethTrace.mapToSvgElements` gates on: one element per
    // declared region, or that map's highlight is withdrawn outright.
    const layers = layersFor([NORTH, EUROPE]);

    for (const layer of layers) {
      const selectors = layer.selectors as string[];
      expect(selectors).toHaveLength(3);
      for (const one of selectors) {
        expect(document.querySelectorAll(one)).toHaveLength(1);
      }
    }
  });

  it('scopes by the whole class attribute rather than by a token', () => {
    const [north, europe] = layersFor([NORTH, EUROPE]);

    expect((north.selectors as string[])[0])
      .toBe('.geolayer > g[class=\'geo geo\'] > g.backplot > g.choroplethlayer'
        + ' > g.trace.choropleth:nth-of-type(1) > path.choroplethlocation:nth-of-type(1)');
    expect((europe.selectors as string[])[0])
      .toBe('.geolayer > g[class=\'geo geo2\'] > g.backplot > g.choroplethlayer'
        + ' > g.trace.choropleth:nth-of-type(1) > path.choroplethlocation:nth-of-type(1)');
  });
});

describe('a figure with one geo subplot', () => {
  it('still resolves every region, the ordinary case', () => {
    // The single map is what the token form got right, so it is what a fix
    // could quietly break.
    const [only] = layersFor([NORTH]);

    expect(resolved(only)).toEqual(['USA', 'CAN', 'MEX']);
  });
});

describe('a double-digit geo id', () => {
  it('does not collide with the ids it is prefixed by', () => {
    // Attribute matching is whole-string, so `geo10` names neither `geo` nor
    // `geo2` — and `.geolayer`'s children are in geo-id order, numerically,
    // so `geo10` sorts after `geo2`.
    const layers = layersFor([
      NORTH,
      EUROPE,
      { id: 'geo10', locations: ['IND', 'AUS'] },
    ]);

    expect(layers.map(layer => resolved(layer)))
      .toEqual([['USA', 'CAN', 'MEX'], ['FRA', 'DEU', 'ITA'], ['IND', 'AUS']]);
  });
});
