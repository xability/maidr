import type { HexbinPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeGraphic, fakeSeries } from './helpers';

interface Tile {
  x: number;
  y: number;
  value: number;
  name?: string;
}

/** A `tilemap` series — the honeycomb Highcharts draws a hex lattice with. */
function tilemapChart(
  tiles: Tile[],
  overrides: {
    tileShape?: string;
    reversed?: boolean;
    yCategories?: string[];
    withGraphics?: boolean;
  } = {},
): ReturnType<typeof fakeChart> {
  const xAxis = fakeAxis({ options: { title: { text: 'Column' } } });
  const yAxis = fakeAxis({
    reversed: overrides.reversed,
    categories: overrides.yCategories,
    options: { title: { text: 'Row' } },
  });

  return fakeChart({
    title: 'Honeycomb',
    renderToId: 'hexbin-chart',
    type: 'tilemap',
    series: [fakeSeries({
      index: 0,
      type: 'tilemap',
      name: 'Density',
      xAxis,
      yAxis,
      options: overrides.tileShape ? { tileShape: overrides.tileShape } : {},
      data: tiles.map(tile => ({
        ...tile,
        graphic: overrides.withGraphics ? fakeGraphic() : undefined,
      })),
    })],
  });
}

/** Declared out of lattice order, the way a honeycomb map is authored. */
const TILES: Tile[] = [
  { x: 1, y: 1, value: 9 },
  { x: 0, y: 0, value: 4 },
  { x: 2, y: 0, value: 7 },
  { x: 1, y: 0, value: 2 },
  { x: 0, y: 1, value: 5 },
];

describe('highcharts tilemap charts', () => {
  it('reads a hexagonal tilemap as a hexbin lattice', () => {
    const chart = tilemapChart(TILES);

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.HEXBIN);
    // Grouped into rows along y, ordered along x within each — the lattice
    // MAIDR walks, not the order the tiles were declared in.
    expect(layer.data as HexbinPoint[][]).toEqual([
      [
        { x: 0, y: 0, count: 4 },
        { x: 1, y: 0, count: 2 },
        { x: 2, y: 0, count: 7 },
      ],
      [
        { x: 0, y: 1, count: 5 },
        { x: 1, y: 1, count: 9 },
      ],
    ]);
    expect(layer.axes).toEqual({
      x: { label: 'Column' },
      y: { label: 'Row' },
      z: { label: 'Count' },
    });
  });

  it('addresses each bin by its stamped lattice index', () => {
    const chart = tilemapChart(TILES, { withGraphics: true });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.selectors).toEqual([
      '#hexbin-chart .highcharts-series-group .highcharts-series-0 [data-maidr-bin-index="0"]',
      '#hexbin-chart .highcharts-series-group .highcharts-series-0 [data-maidr-bin-index="1"]',
      '#hexbin-chart .highcharts-series-group .highcharts-series-0 [data-maidr-bin-index="2"]',
      '#hexbin-chart .highcharts-series-group .highcharts-series-0 [data-maidr-bin-index="3"]',
      '#hexbin-chart .highcharts-series-group .highcharts-series-0 [data-maidr-bin-index="4"]',
    ]);
    // Stamped in lattice order, so the DOM's declaration order is bypassed:
    // the tile declared first, (1, 1), is bin 4.
    expect(chart.series[0].data.map(p =>
      p.graphic?.element.getAttribute('data-maidr-bin-index')))
      .toEqual(['4', '0', '2', '1', '3']);
  });

  it('skips rather than compacts the index of a tile it never drew', () => {
    const chart = tilemapChart(TILES, { withGraphics: true });
    // Highcharts drew no marker for (0, 0) and (1, 0) -- lattice bins 0 and 1.
    for (const point of chart.series[0].data) {
      if (point.y === 0 && point.x !== 2) {
        point.graphic = undefined;
      }
    }

    highchartsToMaidr(chart);

    // The undrawn bins simply carry no stamp, and every bin that was drawn
    // keeps the lattice index its announcement uses. Renumbering around the
    // gaps would slide bin 2's highlight onto bin 0's neighbour and mispair
    // every announcement after it.
    expect(chart.series[0].data.map(p => [
      p.x,
      p.y,
      p.graphic?.element.getAttribute('data-maidr-bin-index') ?? null,
    ])).toEqual([
      [1, 1, '4'],
      [0, 0, null],
      [2, 0, '2'],
      [1, 0, null],
      [0, 1, '3'],
    ]);
  });

  it('names the rows from the y axis categories when it has them', () => {
    const chart = tilemapChart(TILES, { yCategories: ['South', 'North'] });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect((layer.data as HexbinPoint[][]).map(row => row[0].y))
      .toEqual(['South', 'North']);
    // x stays numeric even so: `HexbinTrace` resolves a vertical move by x
    // distance, which a category label has none of.
    expect((layer.data as HexbinPoint[][])[0].map(bin => bin.x)).toEqual([0, 1, 2]);
  });

  it('runs the rows the other way on a reversed y axis', () => {
    const chart = tilemapChart(TILES, { reversed: true });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    // Row 0 is the bottom of the lattice, which is what MAIDR's "up" moves
    // away from — reversing the axis moves it to the top.
    expect((layer.data as HexbinPoint[][]).map(row => row[0].y)).toEqual([1, 0]);
  });

  it('counts a tile that declares no value as an empty bin', () => {
    const chart = tilemapChart([{ x: 0, y: 0, value: 3 }, { x: 1, y: 0 } as Tile]);

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    // Highcharts still draws it, so dropping it would slide every later bin's
    // highlight onto its neighbour.
    expect((layer.data as HexbinPoint[][])[0]).toEqual([
      { x: 0, y: 0, count: 3 },
      { x: 1, y: 0, count: 0 },
    ]);
  });

  it('reads a square tilemap as the aligned grid it is', () => {
    const chart = tilemapChart(TILES, { tileShape: 'square' });

    // Square tiles do not stagger, so the lattice a hexbin is navigated by is
    // not what the chart draws.
    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type)
      .toBe(TraceType.HEATMAP);
  });

  it('reads a diamond tilemap as a hexbin, since it staggers too', () => {
    const chart = tilemapChart(TILES, { tileShape: 'diamond' });

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type)
      .toBe(TraceType.HEXBIN);
  });
});
