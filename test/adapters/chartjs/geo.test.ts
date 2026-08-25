/**
 * The Chart.js adapter refused maps, though `choropleth` has existed since
 * #684 (#1178).
 *
 * `chartjs-chart-geo` is one of three plugin families the adapter still threw
 * on. The same map drawn in amCharts, AnyChart, Google Charts or Vega-Lite was
 * navigable; only a Chart.js one raised.
 *
 * Measured against a running chart -- `chart.js@4.5` with
 * `chartjs-chart-geo@4`, driven headlessly through Chart.js's own
 * `BasicPlatform` -- and the two controllers differ in exactly one place:
 *
 *     choropleth  parsed [{r: 10}, {r: 20}]
 *                 element GeoFeature, x/y = 191.7/171.1  <- pixels
 *                 el.center = undefined, unless the row declared one
 *     bubbleMap   parsed [{x: 1, y: 1, r: 10}, {x: 5, y: 5, r: 20}]
 *                 element PointElement
 *                 parse reads `longitude ?? x` and `latitude ?? y`
 *
 * So a bubble map carries its centroid in **degrees** on every row while a
 * choropleth carries none -- the drawn shape's coordinates are canvas pixels,
 * and the only geographic thing on the row is the raw GeoJSON. That
 * asymmetry, not a choice, is what decides which map is laid out
 * geographically and which is read as a list.
 *
 * Both are read as `TraceType.CHOROPLETH`. A map is a set of named places
 * each carrying one value, and what is drawn at a place changes the picture
 * rather than the reading -- the same call a marker-mode Google Charts
 * GeoChart already gets.
 */
import type { ChartJsChart, ChartJsDataset, ChartJsDataValue } from '@adapters/chartjs/types';
import type { ChoroplethPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

interface GeoOptions {
  labels?: (string | number)[];
  /** The value scale's title — the only place a geo chart names its measure. */
  valueTitle?: string;
}

/** A GeoJSON feature, as terse as the plugin will take. */
function feature(name?: string): ChartJsDataValue {
  return {
    type: 'Feature',
    ...(name === undefined ? {} : { properties: { name } }),
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  } as unknown as ChartJsDataValue;
}

/**
 * A geo chart as Chart.js leaves it after `update()`.
 *
 * `_parsed` is supplied rather than derived because it is what the two
 * controllers produce and what the reading is taken from -- the value on `r`
 * for both, the caller's degrees on `x`/`y` for a bubble map alone.
 *
 * @param chartType - Which controller drew it
 * @param datasets - One entry per map: its rows, and what each parsed to
 * @param options - The place names and the value scale's title
 * @returns The chart
 */
function geoChart(
  chartType: 'choropleth' | 'bubbleMap',
  datasets: { rows: ChartJsDataValue[]; parsed: Record<string, number | null>[]; label?: string }[],
  options: GeoOptions = {},
): ChartJsChart {
  const { labels, valueTitle } = options;
  const valueScale = chartType === 'choropleth' ? 'color' : 'size';
  return {
    canvas: {} as HTMLCanvasElement,
    data: {
      ...(labels === undefined ? {} : { labels }),
      datasets: datasets.map(({ rows, label }, index) => ({
        label: label ?? `M${index + 1}`,
        data: rows,
      })) as unknown as ChartJsDataset[],
    },
    options: {
      plugins: {},
      scales: {
        projection: {},
        // Materialised the way `chart.update()` leaves it: an untitled scale
        // carries an empty string rather than no title at all.
        [valueScale]: { title: { text: valueTitle ?? '' } },
      },
    },
    config: { type: chartType },
    getDatasetMeta: (index: number) => ({
      data: [],
      type: chartType,
      _parsed: datasets[index]?.parsed ?? [],
    }),
    setActiveElements: () => {},
  } as unknown as ChartJsChart;
}

/** Every layer of a geo chart, as `(layer, regions)`. */
function geoLayers(chart: ChartJsChart): { layer: any; regions: ChoroplethPoint[] }[] {
  return extractChartData(chart).maidr.subplots[0][0].layers.map(layer => ({
    layer,
    regions: layer.data as ChoroplethPoint[],
  }));
}

/** Two shaded regions, the plain choropleth spelling. */
const SHADED = {
  rows: [
    { feature: feature('Alpha'), value: 10 },
    { feature: feature('Beta'), value: 20 },
  ] as unknown as ChartJsDataValue[],
  parsed: [{ r: 10 }, { r: 20 }],
};

/** Two placed bubbles, the plain bubble-map spelling. */
const PLACED = {
  rows: [
    { longitude: -116.6, latitude: 39.3, value: 10 },
    { longitude: -111.7, latitude: 39.5, value: 20 },
  ] as unknown as ChartJsDataValue[],
  parsed: [
    { x: -116.6, y: 39.3, r: 10 },
    { x: -111.7, y: 39.5, r: 20 },
  ],
};

describe('chart.js geo', () => {
  it('reads a choropleth as a map rather than raising', () => {
    // The reproduction. Before this the dispatcher's default threw, naming
    // every supported type and not this one.
    const [{ layer, regions }] = geoLayers(
      geoChart('choropleth', [SHADED], { labels: ['Nevada', 'Utah'] }),
    );

    expect(layer.type).toBe(TraceType.CHOROPLETH);
    expect(regions).toEqual([
      { x: 'Nevada', y: 10 },
      { x: 'Utah', y: 20 },
    ]);
  });

  it('reads a bubble map as the same map, and carries its centroids', () => {
    // The asymmetry the plugin creates: a bubble map's parse holds the
    // caller's own `longitude`/`latitude`, so every place has a position and
    // the model can lay the map out geographically.
    const [{ layer, regions }] = geoLayers(
      geoChart('bubbleMap', [PLACED], { labels: ['Nevada', 'Utah'] }),
    );

    expect(layer.type).toBe(TraceType.CHOROPLETH);
    expect(regions).toEqual([
      { x: 'Nevada', y: 10, lon: -116.6, lat: 39.3 },
      { x: 'Utah', y: 20, lon: -111.7, lat: 39.5 },
    ]);
  });

  it('leaves a choropleth unplaced rather than inventing a centroid', () => {
    // Measured, a `GeoFeature`'s `x`/`y` and `getCenterPoint()` are canvas
    // pixels. Inverting them through the projection would answer in degrees,
    // but they would be the degrees of the *drawn* centre rather than the
    // region's centroid -- so nothing is emitted and the map is read as the
    // region list the data supports.
    const [{ regions }] = geoLayers(
      geoChart('choropleth', [SHADED], { labels: ['Nevada', 'Utah'] }),
    );

    expect(regions.every(region => region.lon === undefined)).toBe(true);
    expect(regions.every(region => region.lat === undefined)).toBe(true);
  });

  it('takes the centroid a choropleth row declares', () => {
    // `center` is the one geographic position a choropleth carries, and the
    // plugin reads it too -- it is what places a region's label.
    const [{ regions }] = geoLayers(geoChart('choropleth', [{
      rows: [
        { feature: feature('Nevada'), value: 10, center: { longitude: -116.6, latitude: 39.3 } },
        { feature: feature('Utah'), value: 20, center: { longitude: -111.7, latitude: 39.5 } },
      ] as unknown as ChartJsDataValue[],
      parsed: [{ r: 10 }, { r: 20 }],
    }], { labels: ['Nevada', 'Utah'] }));

    expect(regions).toEqual([
      { x: 'Nevada', y: 10, lon: -116.6, lat: 39.3 },
      { x: 'Utah', y: 20, lon: -111.7, lat: 39.5 },
    ]);
  });

  it.each([
    ['no longitude', { y: 39.3, r: 10 }],
    ['no latitude', { x: -116.6, r: 10 }],
  ])('emits no centroid for a bubble with %s', (_case, parsed) => {
    // Half a coordinate places nothing, and `ChoroplethTrace` bands a map
    // only when every region has both -- so a partial pair would be carried
    // the whole way and then dropped. Measured, a row written without
    // coordinates parses to the value alone, so either half can go missing
    // on its own.
    const [{ regions }] = geoLayers(geoChart('bubbleMap', [{
      rows: [{ value: 10 }] as unknown as ChartJsDataValue[],
      parsed: [parsed],
    }], { labels: ['Nevada'] }));

    expect(regions).toEqual([{ x: 'Nevada', y: 10 }]);
  });

  it('names a region from its GeoJSON when the chart labelled none', () => {
    // The plugin's tooltip answers `undefined` here, but the region is named
    // inside the shape it draws -- under the property names the shared
    // choropleth chain already covers.
    const [{ regions }] = geoLayers(geoChart('choropleth', [SHADED]));

    expect(regions.map(region => region.x)).toEqual(['Alpha', 'Beta']);
  });

  it('treats an empty label as no label rather than as a name', () => {
    // A short `labels` array padded out, or a row the author had no name for.
    // The plugin's own tooltip announces the empty string; MAIDR has the
    // GeoJSON to fall back on and a region announced as nothing at all is
    // a region the reader cannot tell from its neighbour.
    const [{ regions }] = geoLayers(geoChart('choropleth', [SHADED], { labels: ['', 'Utah'] }));

    expect(regions.map(region => region.x)).toEqual(['Alpha', 'Utah']);
  });

  it('falls back to the position when nothing names a place', () => {
    // A poor name, but `x` is required and a place with no name is still a
    // place on the map -- the same last resort the bar family takes for an
    // unlabelled category.
    const [{ regions }] = geoLayers(geoChart('choropleth', [{
      rows: [{ feature: feature(), value: 10 }] as unknown as ChartJsDataValue[],
      parsed: [{ r: 10 }],
    }]));

    expect(regions).toEqual([{ x: 0, y: 10 }]);
  });

  it('names the value from the legend scale rather than answering "Y"', () => {
    // A geo chart has no `x` or `y` scale at all -- measured, a running one
    // carries `projection` plus one legend scale -- so the generic axis
    // reader would answer "Y" for what the map is of. The two controllers
    // name that scale differently: a choropleth shades by `color`, a bubble
    // map sizes by `size`, and reading the wrong one finds no title.
    const [shaded] = geoLayers(
      geoChart('choropleth', [SHADED], { labels: ['Nevada', 'Utah'], valueTitle: 'Rate' }),
    );
    const [placed] = geoLayers(
      geoChart('bubbleMap', [PLACED], { labels: ['Nevada', 'Utah'], valueTitle: 'Population' }),
    );

    expect(shaded.layer.axes).toEqual({
      x: { label: 'Region' },
      y: { label: 'Rate' },
    });
    expect(placed.layer.axes).toEqual({
      x: { label: 'Region' },
      y: { label: 'Population' },
    });
  });

  it('names the value plainly when the chart titled no scale', () => {
    // Not "Y": the reader is on a map, and the fallback has to say what the
    // shading is rather than name an axis the chart does not have.
    //
    // Measured on a running chart, an untitled scale is not absent -- it
    // carries `title.text: ''`, which a nullish test passes straight through
    // as a label announcing nothing.
    const [{ layer }] = geoLayers(
      geoChart('choropleth', [SHADED], { labels: ['Nevada', 'Utah'] }),
    );

    expect(layer.axes).toEqual({
      x: { label: 'Region' },
      y: { label: 'Value' },
    });
  });

  it('skips a region the map draws no value for', () => {
    // Measured, a `null` value parses to `r: null` and the colour scale
    // paints the region with `missing` rather than a shade. Announcing it
    // would sonify a zero the map declines to show.
    const [{ regions }] = geoLayers(geoChart('choropleth', [{
      rows: [
        { feature: feature('Alpha'), value: 10 },
        { feature: feature('Beta'), value: null },
        { feature: feature('Gamma'), value: 30 },
      ] as unknown as ChartJsDataValue[],
      parsed: [{ r: 10 }, { r: null }, { r: 30 }],
    }], { labels: ['Alpha', 'Beta', 'Gamma'] }));

    expect(regions).toEqual([
      { x: 'Alpha', y: 10 },
      { x: 'Gamma', y: 30 },
    ]);
  });

  it('reads two datasets as two maps', () => {
    // Two datasets over the same regions are two measures of them -- two
    // years of the same rate -- rather than one map of twice as many places.
    const layers = geoLayers(geoChart('choropleth', [
      { ...SHADED, label: '2024' },
      { rows: SHADED.rows, parsed: [{ r: 30 }, { r: 40 }], label: '2025' },
    ], { labels: ['Nevada', 'Utah'] }));

    expect(layers).toHaveLength(2);
    expect(layers.map(({ layer }) => layer.title)).toEqual(['2024', '2025']);
    expect(layers[0].regions.map(region => region.y)).toEqual([10, 20]);
    expect(layers[1].regions.map(region => region.y)).toEqual([30, 40]);
  });

  it('outlines the region a list-ordered map announces', () => {
    // A map with no centroids keeps its declared order in one band -- a
    // documented contract of `ChoroplethTrace`, pinned by
    // `test/model/choropleth.test.ts` -- so column `i` is the payload's `i`,
    // and the gap-skipping walk maps it back onto the drawn element.
    const chart = geoChart('choropleth', [{
      rows: [
        { feature: feature('Alpha'), value: 10 },
        { feature: feature('Beta'), value: null },
        { feature: feature('Gamma'), value: 30 },
      ] as unknown as ChartJsDataValue[],
      parsed: [{ r: 10 }, { r: null }, { r: 30 }],
    }], { labels: ['Alpha', 'Beta', 'Gamma'] });
    const extraction = extractChartData(chart);
    const layers = extraction.maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, extraction.layerDatasetIndices);

    const targets = [0, 1].map(col =>
      resolveActiveTargets(layers, maps, extraction.layerDatasetIndices, layers[0].id, 0, col));

    // Column 1 is Gamma, drawn third: the unshaded region between them is
    // still an element of the chart.
    expect(targets).toEqual([
      [{ datasetIndex: 0, index: 0 }],
      [{ datasetIndex: 0, index: 2 }],
    ]);
  });

  it('outlines a part-placed map, which the model does not band', () => {
    // `ChoroplethTrace` bands a map only when *every* region has both
    // halves of its centroid; one that does not keeps its declared order in
    // one band, exactly as a map with no centroids at all does. So the test
    // for declining is "all placed", not "any placed" -- and measured, a
    // bubble map row written without coordinates parses to the value alone,
    // which is how a part-placed map arises.
    const chart = geoChart('bubbleMap', [{
      rows: [
        { longitude: -116.6, latitude: 39.3, value: 10 },
        { value: 20 },
      ] as unknown as ChartJsDataValue[],
      parsed: [{ x: -116.6, y: 39.3, r: 10 }, { r: 20 }],
    }], { labels: ['Nevada', 'Utah'] });
    const extraction = extractChartData(chart);
    const layers = extraction.maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, extraction.layerDatasetIndices);

    const targets = [0, 1].map(col =>
      resolveActiveTargets(layers, maps, extraction.layerDatasetIndices, layers[0].id, 0, col));

    expect(targets).toEqual([
      [{ datasetIndex: 0, index: 0 }],
      [{ datasetIndex: 0, index: 1 }],
    ]);
  });

  it('outlines nothing on a placed map rather than outlining the wrong place', () => {
    // `ChoroplethTrace` lays a placed map out south to north in bands, so a
    // column there names a spot on the globe and not a row of the dataset.
    // The bottom of `resolveActiveTargets` would answer `{index: col}` --
    // audio, text and braille all correct while the wrong region lights up,
    // which is the failure #814 named for the sankey.
    const chart = geoChart('bubbleMap', [PLACED], { labels: ['Nevada', 'Utah'] });
    const extraction = extractChartData(chart);
    const layers = extraction.maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, extraction.layerDatasetIndices);

    const targets = [0, 1].map(col =>
      resolveActiveTargets(layers, maps, extraction.layerDatasetIndices, layers[0].id, 0, col));

    expect(targets).toEqual([[], []]);
  });

  it('outlines each map from its own dataset', () => {
    // The per-type default is "every dataset, in order", which hands both
    // layers the first dataset -- so the second map would outline the first
    // one's regions.
    const chart = geoChart('choropleth', [
      SHADED,
      { rows: SHADED.rows, parsed: [{ r: 30 }, { r: 40 }] },
    ], { labels: ['Nevada', 'Utah'] });
    const extraction = extractChartData(chart);
    const layers = extraction.maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, extraction.layerDatasetIndices);

    const first = resolveActiveTargets(
      layers,
      maps,
      extraction.layerDatasetIndices,
      layers[0].id,
      0,
      1,
    );
    const second = resolveActiveTargets(
      layers,
      maps,
      extraction.layerDatasetIndices,
      layers[1].id,
      0,
      1,
    );

    expect(first).toEqual([{ datasetIndex: 0, index: 1 }]);
    expect(second).toEqual([{ datasetIndex: 1, index: 1 }]);
  });

  it('emits no layer for a map that drew no value at all', () => {
    const layers = geoLayers(geoChart('choropleth', [{
      rows: [{ feature: feature('Alpha'), value: null }] as unknown as ChartJsDataValue[],
      parsed: [{ r: null }],
    }], { labels: ['Alpha'] }));

    expect(layers).toEqual([]);
  });
});
