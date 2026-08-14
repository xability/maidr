import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { ChoroplethPoint, MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { TraceType } from '@type/grammar';
import { makeView } from './fixtures/testView';

/**
 * The Vega-Lite gallery's choropleth recipe: geometry from a TopoJSON file,
 * values joined onto it by a `lookup` transform, and a colour encoding
 * shading each region.
 *
 * `projection` is omitted throughout — it is what draws the map, but nothing
 * in it says the chart is a choropleth, and the adapter never reads it.
 */
const CHOROPLETH_SPEC: VegaLiteSpec = {
  data: { url: 'states.json', format: { type: 'topojson', feature: 'states' } },
  transform: [
    {
      lookup: 'properties.name',
      from: { data: { url: 'unemployment.csv' }, key: 'state', fields: ['rate'] },
    },
  ],
  mark: 'geoshape',
  encoding: {
    color: { field: 'rate', type: 'quantitative', title: 'Unemployment rate' },
  },
};

/**
 * The features as Vega hands them over after the join: GeoJSON features
 * whose name is nested under `properties`, with the joined column alongside.
 */
const STATE_ROWS = [
  { type: 'Feature', properties: { name: 'Nevada' }, rate: 4.2 },
  { type: 'Feature', properties: { name: 'Utah' }, rate: 2.8 },
  { type: 'Feature', properties: { name: 'Idaho' }, rate: 3.1 },
];

/**
 * Convert a spec and return its single layer.
 *
 * @param spec The Vega-Lite spec to convert
 * @param datasets The compiled view's datasets
 * @returns The single converted layer
 */
function onlyLayer(
  spec: VegaLiteSpec,
  datasets: Record<string, unknown[]> = { data_0: STATE_ROWS },
): MaidrLayer {
  const layers = vegaLiteToMaidr(spec, makeView(datasets)).subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

/**
 * Convert a spec and return every layer it produced.
 *
 * @param spec The Vega-Lite spec to convert
 * @param datasets The compiled view's datasets
 * @returns The converted layers
 */
function allLayers(
  spec: VegaLiteSpec,
  datasets: Record<string, unknown[]> = { data_0: STATE_ROWS },
): MaidrLayer[] {
  return vegaLiteToMaidr(spec, makeView(datasets)).subplots[0][0].layers;
}

/**
 * The regions of a choropleth layer.
 *
 * @param layer The converted layer
 * @returns Its payload, typed
 */
function regionsOf(layer: MaidrLayer): ChoroplethPoint[] {
  return layer.data as ChoroplethPoint[];
}

describe('vega-Lite geoshape maps', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('reads a shaded geoshape as a choropleth', () => {
    // Before this, `geoshape` fell to `resolveTraceType`'s `default: return
    // null`, the spec produced zero layers and `bindVegaLite` skipped
    // binding outright — the map was invisible to MAIDR, not merely
    // unannounced.
    expect(onlyLayer(CHOROPLETH_SPEC).type).toBe(TraceType.CHOROPLETH);
  });

  it('names the regions from the join and shades them from the colour field', () => {
    // The join key IS the region's identity: it is the one field present on
    // every drawn feature and distinct between them. `properties.name` is a
    // path into the feature, which is why a flat `row[field]` read is not
    // enough.
    expect(regionsOf(onlyLayer(CHOROPLETH_SPEC))).toEqual([
      { x: 'Nevada', y: 4.2 },
      { x: 'Utah', y: 2.8 },
      { x: 'Idaho', y: 3.1 },
    ]);
  });

  it('announces the region names and the shaded quantity as the two axes', () => {
    const layer = onlyLayer(CHOROPLETH_SPEC);

    // A map has no `x` or `y` channel at all, so without this both axes are
    // announced as the empty string: the reader is told a name and a number
    // and never what either measures. The region axis is named after the
    // leaf of the join path rather than the path itself.
    expect(layer.axes?.x?.label).toBe('name');
    expect(layer.axes?.y?.label).toBe('Unemployment rate');
  });

  it('points the highlight at the shape group Vega actually renders', () => {
    // Vega has no `geoshape` mark: Vega-Lite compiles one to a Vega `shape`
    // mark. `mark-geoshape` — what the default branch of `markToCssClass`
    // produces — matches nothing in a rendered map, so the layer would
    // sonify and announce while highlighting nothing.
    expect(onlyLayer(CHOROPLETH_SPEC).selectors).toBe(
      'g.mark-shape.role-mark.marks path, g.mark-shape.role-mark.layer_0_marks path',
    );
  });

  it('leaves an unshaded geoshape unread', () => {
    // The outline layer a choropleth is usually drawn on top of. It carries
    // no data, and announcing it would give the reader a chart of nothing.
    const outline: VegaLiteSpec = { mark: 'geoshape', encoding: {} };

    expect(allLayers(outline)).toHaveLength(0);
  });

  it('reads the shaded layer of an outline-plus-choropleth map', () => {
    const layered: VegaLiteSpec = {
      transform: CHOROPLETH_SPEC.transform,
      layer: [
        { mark: 'geoshape', encoding: {} },
        { mark: 'geoshape', encoding: CHOROPLETH_SPEC.encoding },
      ],
    };

    const layers = allLayers(layered, { data_1: STATE_ROWS });
    expect(layers).toHaveLength(1);
    // The outline drops out, but the choropleth is still Vega layer 1 and
    // its marks are rendered under `layer_1_marks`. Highlighting the wrong
    // group would highlight the unshaded outlines.
    expect(layers[0].selectors).toBe('g.mark-shape.role-mark.layer_1_marks path');
  });

  it('drops a feature the join left unmatched rather than shading it zero', () => {
    const rows = [
      { properties: { name: 'Nevada' }, rate: 4.2 },
      { properties: { name: 'Wyoming' } },
      { properties: { name: 'Utah' }, rate: 2.8 },
    ];

    const layer = onlyLayer(CHOROPLETH_SPEC, { data_0: rows });

    // A region announced as 0 is a claim the map does not make, and on a
    // rate it is the lowest value on the scale: the loudest possible wrong
    // answer.
    expect(regionsOf(layer).map(region => region.x)).toEqual(['Nevada', 'Utah']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('carry no value'));
  });

  it('names the regions from the tooltip when no lookup transform built the map', () => {
    const inlined: VegaLiteSpec = {
      mark: 'geoshape',
      encoding: {
        color: { field: 'rate', type: 'quantitative' },
        tooltip: [
          { field: 'rate', type: 'quantitative' },
          { field: 'state', type: 'nominal', title: 'State' },
        ],
      },
    };

    const layer = onlyLayer(inlined, {
      data_0: [
        { state: 'Nevada', rate: 4.2 },
        { state: 'Utah', rate: 2.8 },
      ],
    });

    // The first tooltip entry names the shaded value. Taking it would
    // announce "4.2" as the region's name and leave the map without any.
    expect(regionsOf(layer).map(region => region.x)).toEqual(['Nevada', 'Utah']);
    expect(layer.axes?.x?.label).toBe('State');
  });

  it('leaves a map whose regions are named nowhere unread', () => {
    const anonymous: VegaLiteSpec = {
      mark: 'geoshape',
      encoding: { color: { field: 'rate', type: 'quantitative' } },
    };

    // Numbering the regions 0, 1, 2 would announce a position in the file as
    // if it were a place.
    expect(allLayers(anonymous, { data_0: [{ rate: 4.2 }] })).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('names its regions'));
  });
});

describe('vega-Lite geoshape maps with a usermeta declaration', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('reads the declared columns over the ones the spec would give', () => {
    const declared: VegaLiteSpec = {
      ...CHOROPLETH_SPEC,
      usermeta: {
        maidr: { type: TraceType.CHOROPLETH, region: 'label', value: 'pct' },
      },
    };

    const layer = onlyLayer(declared, {
      data_0: [
        { properties: { name: 'NV' }, label: 'Nevada', rate: 99, pct: 4.2 },
        { properties: { name: 'UT' }, label: 'Utah', rate: 99, pct: 2.8 },
      ],
    });

    // Both facts come from the block, not from the join key or the colour
    // channel — a declaration outranks every heuristic.
    expect(regionsOf(layer)).toEqual([
      { x: 'Nevada', y: 4.2 },
      { x: 'Utah', y: 2.8 },
    ]);
  });

  it('places the regions on the map when the rows carry centroids', () => {
    const declared: VegaLiteSpec = {
      ...CHOROPLETH_SPEC,
      usermeta: { maidr: { type: TraceType.CHOROPLETH } },
    };

    const layer = onlyLayer(declared, {
      data_0: [
        { properties: { name: 'Nevada' }, rate: 4.2, lon: -116.6, lat: 39.3 },
        { properties: { name: 'Utah' }, rate: 2.8, longitude: -111.7, latitude: 39.3 },
      ],
    });

    // `lon`/`lat` default to their own names and then to the shared fallback
    // chain, so a row that already carries `longitude` needs nothing said.
    // The pair is what turns the region list into a walk across the map.
    expect(regionsOf(layer)).toEqual([
      { x: 'Nevada', y: 4.2, lon: -116.6, lat: 39.3 },
      { x: 'Utah', y: 2.8, lon: -111.7, lat: 39.3 },
    ]);
  });

  it('omits a centroid whose coordinates are not degrees', () => {
    const declared: VegaLiteSpec = {
      ...CHOROPLETH_SPEC,
      usermeta: { maidr: { type: TraceType.CHOROPLETH, lon: 'px', lat: 'py' } },
    };

    const layer = onlyLayer(declared, {
      data_0: [{ properties: { name: 'Nevada' }, rate: 4.2, px: null, py: 'left' }],
    });

    // A projected or unparseable coordinate is left out rather than coerced:
    // `Number(null)` is 0, which would place the region off the west coast of
    // Africa and send every compass direction on the map through it.
    expect(regionsOf(layer)).toEqual([{ x: 'Nevada', y: 4.2 }]);
  });

  it('reports a declared field no row carries', () => {
    const declared: VegaLiteSpec = {
      ...CHOROPLETH_SPEC,
      usermeta: { maidr: { type: TraceType.CHOROPLETH, lon: 'centoidLon', lat: 'lat' } },
    };

    const layer = onlyLayer(declared, {
      data_0: [{ properties: { name: 'Nevada' }, rate: 4.2, centroidLon: -116.6, lat: 39.3 }],
    });

    // An explicit name is used verbatim with no fallback, so the typo
    // resolves on no row and the map quietly loses its spatial walk. Saying
    // which name missed is the only way the author finds out.
    expect(regionsOf(layer)).toEqual([{ x: 'Nevada', y: 4.2 }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"centoidLon"'));
  });

  it('reads a declared choropleth that no colour encoding shades', () => {
    // The one thing a `geoshape` spec cannot say for itself: the regions are
    // drawn plain and the value lives in a column. Without the declaration
    // this is the outline map above, and reads as nothing.
    const declared: VegaLiteSpec = {
      mark: 'geoshape',
      transform: CHOROPLETH_SPEC.transform,
      usermeta: { maidr: { type: TraceType.CHOROPLETH, value: 'rate' } },
    };

    const layer = onlyLayer(declared);
    expect(layer.type).toBe(TraceType.CHOROPLETH);
    expect(regionsOf(layer)).toHaveLength(3);
  });

  it('names the layer without honouring a type the marks cannot back', () => {
    const declared: VegaLiteSpec = {
      data: { values: [{ a: 'A', b: 28 }] },
      mark: 'bar',
      encoding: {
        x: { field: 'a', type: 'nominal' },
        y: { field: 'b', type: 'quantitative' },
      },
      usermeta: { maidr: { type: TraceType.CHOROPLETH, name: 'Sales' } },
    };

    const layer = onlyLayer(declared, { data_0: [{ a: 'A', b: 28 }] });

    // Reading a bar as a map would announce category names as places and
    // walk them by compass direction. The disagreement is reported and the
    // chart is read as what was actually drawn.
    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.name).toBe('Sales');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"bar" mark'));
  });

  it('ignores a declaration written on a composite parent', () => {
    const composite: VegaLiteSpec = {
      transform: CHOROPLETH_SPEC.transform,
      usermeta: { maidr: { type: TraceType.CHOROPLETH } },
      layer: [{ mark: 'geoshape', encoding: CHOROPLETH_SPEC.encoding }],
    };

    // A block on a parent names none of the several layers below it, so
    // there is no layer it could be applied to without guessing.
    expect(allLayers(composite, { data_1: STATE_ROWS })[0].type)
      .toBe(TraceType.CHOROPLETH);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('composite spec'));
  });

  it('falls back to the drawn chart when the declaration is malformed', () => {
    const declared: VegaLiteSpec = {
      ...CHOROPLETH_SPEC,
      usermeta: { maidr: { type: 'chloropleth' } as never },
    };

    // The typo is the case the closed key set and the type check exist for:
    // in plain JS nothing else would catch it. The map still reads, because
    // the mark says what it is.
    expect(onlyLayer(declared).type).toBe(TraceType.CHOROPLETH);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown type "chloropleth"'));
  });
});
