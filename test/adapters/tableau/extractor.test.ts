import type { TableauExtraction } from '@adapters/tableau/extractor';
import type {
  TableauColumn,
  TableauMarkType,
  WorksheetSnapshot,
} from '@adapters/tableau/types';
import type {
  BarPoint,
  HeatmapData,
  LinePoint,
  MaidrLayer,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
} from '@type/grammar';
import { extractTableau } from '@adapters/tableau/extractor';
import { Orientation, TraceType } from '@type/grammar';
import {
  fakeColumn,
  fakeEncoding,
  fakeField,
  fakeMarksCard,
  fakeSnapshot,
  fakeValue,
  fakeVisualSpec,
} from './helpers';

/** A plain categorical dimension. */
const category = (name = 'Category'): TableauColumn => fakeColumn(name, 'string', 0);

/** A second categorical dimension, the one read as the series. */
const region = (name = 'Region'): TableauColumn => fakeColumn(name, 'string', 1);

/** An aggregated numeric measure. */
const measure = (name = 'SUM(Sales)'): TableauColumn => fakeColumn(name, 'float', 2);

/** A date-part dimension, which the ladder reads as an ordered axis. */
const month = (): TableauColumn => fakeColumn('MONTH(Order Date)', 'date', 0);

/**
 * The only layer of one subplot.
 *
 * One worksheet is exactly one layer and one layer is exactly one subplot, so
 * every lookup in this file is by subplot index.
 *
 * @param extraction - What {@link extractTableau} returned.
 * @param index - The subplot index.
 * @returns That subplot's layer.
 */
function layerOf(extraction: TableauExtraction, index = 0): MaidrLayer {
  return extraction.maidr.subplots[index][0].layers[0];
}

describe('tableau extractor', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  describe('the heuristic ladder', () => {
    it('reads one dimension and one measure as a bar chart in view order', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          name: 'Sales by Category',
          columns: [category(), measure()],
          rows: [['Chairs', 3], ['Tables', 1], ['Phones', 2]],
        }),
      ]);

      const layer = layerOf(extraction);
      expect(layer.type).toBe(TraceType.BAR);
      // View order, not sorted: summary data arrives in the order the view laid
      // the marks out, and that is the order a reader hears them in.
      expect(layer.data as BarPoint[]).toEqual([
        { x: 'Chairs', y: 3 },
        { x: 'Tables', y: 1 },
        { x: 'Phones', y: 2 },
      ]);
    });

    it('skips a bar row whose measure is a gap instead of drawing it at zero', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), measure()],
          rows: [['Chairs', 3], ['Tables', null], ['Phones', 2]],
        }),
      ]);

      expect(layerOf(extraction).data as BarPoint[]).toEqual([
        { x: 'Chairs', y: 3 },
        { x: 'Phones', y: 2 },
      ]);
    });

    it('reads two dimensions and one measure as grouped bars, never as a stack or a heat map', () => {
      // Summary data gives each segment its own value whether Tableau stacked
      // the bars or set them side by side, and two dimensions is equally the
      // signature of a highlight table, so the honest reading is the grouped
      // one.
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), region(), measure()],
          rows: [
            ['Chairs', 'East', 1],
            ['Tables', 'East', 2],
            ['Chairs', 'West', 3],
          ],
        }),
      ]);

      expect(layerOf(extraction).type).toBe(TraceType.DODGED);
    });

    it('rectangularizes grouped bars, padding a missing cell with a gap and never a zero', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), region(), measure()],
          rows: [
            ['Chairs', 'East', 1],
            ['Tables', 'East', 2],
            ['Chairs', 'West', 3],
          ],
        }),
      ]);

      const data = layerOf(extraction).data as SegmentedPoint[][];
      // `SegmentedTrace.createSummaryLevel()` sums across rows by index, so
      // every series must hold the same categories in the same order — but it
      // filters the segments it sums with `isMeasured`, so equal *length* is
      // all it needs. The pad is therefore `NaN`, MAIDR's gap sentinel: a `0`
      // would sonify as a real reading at the bottom of the range, be reachable
      // as the row's minimum, and pull the scale every other bar is pitched
      // against — for a bar the view never drew.
      expect(data).toEqual([
        [
          { x: 'Chairs', y: 1, z: 'East' },
          { x: 'Tables', y: 2, z: 'East' },
        ],
        [
          { x: 'Chairs', y: 3, z: 'West' },
          { x: 'Tables', y: Number.NaN, z: 'West' },
        ],
      ]);
      expect(Number.isNaN(data[1][1].y as number)).toBe(true);
      expect(new Set(data.map(series => series.length)).size).toBe(1);
      expect(data.every(series => series.every(point => point.z !== undefined))).toBe(true);
    });

    it('reads a temporal dimension as a line, nested even for a single series', () => {
      const january = fakeValue(new Date('2021-01-01T00:00:00Z'), 'January 2021');
      const february = fakeValue(new Date('2021-02-01T00:00:00Z'), 'February 2021');
      const march = fakeValue(new Date('2021-03-01T00:00:00Z'), 'March 2021');

      const extraction = extractTableau([
        fakeSnapshot({
          columns: [month(), measure()],
          rows: [[january, 10], [february, null], [march, 30]],
        }),
      ]);

      const layer = layerOf(extraction);
      expect(layer.type).toBe(TraceType.LINE);
      const data = layer.data as LinePoint[][];
      expect(data).toHaveLength(1);
      // `null`, never `0`: `Number(null)` is zero, which would sound like a real
      // low reading and pull the range every other pitch is scaled against.
      expect(data[0]).toEqual([
        { x: 'January 2021', y: 10 },
        { x: 'February 2021', y: null },
        { x: 'March 2021', y: 30 },
      ]);
    });

    it('reads a numeric date-part dimension as a line too, since it is an ordered axis', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [fakeColumn('YEAR(Order Date)', 'int', 0), measure()],
          rows: [[2020, 10], [2021, 20]],
        }),
      ]);

      expect(layerOf(extraction).type).toBe(TraceType.LINE);
    });

    it('reads a continuous axis as a point cloud rather than dropping the worksheet', () => {
      // A continuous field on an axis — an unaggregated `Discount`, or a
      // `Sales (bin)` field — is classified as a second *measure*, because every
      // numeric column goes to the measure rung. The worksheet therefore has no
      // dimension at all, and the point-cloud rung has to be tested before the
      // "nothing to navigate" skip or a perfectly readable view vanishes.
      const extraction = extractTableau([
        fakeSnapshot({
          name: 'Profit by Discount',
          columns: [fakeColumn('Discount', 'float', 0), fakeColumn('SUM(Profit)', 'float', 1)],
          rows: [[0.1, 5], [0.2, 9], [0.3, 2]],
        }),
      ]);

      const layer = layerOf(extraction);
      expect(layer.type).toBe(TraceType.SCATTER);
      expect(layer.data as ScatterPoint[]).toEqual([
        { x: 0.1, y: 5 },
        { x: 0.2, y: 9 },
        { x: 0.3, y: 2 },
      ]);
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('no dimension to navigate'),
      );
    });

    it('gives every point of a grouped line a z, and does not pad the shorter series', () => {
      const january = fakeValue(new Date('2021-01-01T00:00:00Z'), 'January 2021');
      const february = fakeValue(new Date('2021-02-01T00:00:00Z'), 'February 2021');

      const extraction = extractTableau([
        fakeSnapshot({
          columns: [month(), region(), measure()],
          rows: [
            [january, 'East', 10],
            [february, 'East', 20],
            [january, 'West', 5],
          ],
        }),
      ]);

      const data = layerOf(extraction).data as LinePoint[][];
      // A line with fewer samples than its neighbour is a real chart; padding
      // it would draw points the view does not have.
      expect(data).toEqual([
        [
          { x: 'January 2021', y: 10, z: 'East' },
          { x: 'February 2021', y: 20, z: 'East' },
        ],
        [{ x: 'January 2021', y: 5, z: 'West' }],
      ]);
    });

    it('reads several measures over detail dimensions as a numeric point cloud', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [
            fakeColumn('Customer', 'string', 0),
            fakeColumn('SUM(Sales)', 'float', 1),
            fakeColumn('AVG(Profit)', 'float', 2),
          ],
          rows: [
            ['Alice', 10, 1],
            ['Bob', 20, 2],
            ['Cara', 30, null],
          ],
        }),
      ]);

      const layer = layerOf(extraction);
      expect(layer.type).toBe(TraceType.SCATTER);
      // `ScatterPoint.x` and `.y` are strictly numeric, so a row missing either
      // coordinate has no position to be placed at.
      expect(layer.data as ScatterPoint[]).toEqual([
        { x: 10, y: 1 },
        { x: 20, y: 2 },
      ]);
    });

    it('puts a third measure on a point cloud’s z channel', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [
            fakeColumn('Customer', 'string', 0),
            fakeColumn('SUM(Sales)', 'float', 1),
            fakeColumn('AVG(Profit)', 'float', 2),
            fakeColumn('SUM(Quantity)', 'float', 3),
          ],
          rows: [['Alice', 10, 1, 7], ['Bob', 20, 2, 8]],
        }),
      ]);

      expect(layerOf(extraction).data as ScatterPoint[]).toEqual([
        { x: 10, y: 1, z: 7 },
        { x: 20, y: 2, z: 8 },
      ]);
    });

    it('reads several measures over a repeating category as bars, not a point cloud', () => {
      // The dimension is not a detail field — it has fewer distinct values than
      // rows — so the rows are categories rather than observations.
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [
            category(),
            fakeColumn('SUM(Sales)', 'float', 1),
            fakeColumn('AVG(Profit)', 'float', 2),
          ],
          rows: [['Chairs', 10, 1], ['Chairs', 20, 2], ['Tables', 30, 3]],
        }),
      ]);

      expect(layerOf(extraction).type).toBe(TraceType.BAR);
    });
  });

  describe('the visual specification', () => {
    /**
     * What the extractor makes of each of `MarkType`'s members, against
     * {@link markSnapshot}. `null` means the worksheet is refused outright.
     *
     * Typed as a `Record` over the union rather than as a list, so it is the
     * compiler that insists every member appears: a fourteenth member added to
     * {@link TableauMarkType} fails to build here until someone says what the
     * extractor should do with it, and "all thirteen are handled" stays a fact
     * instead of a claim in a comment.
     */
    const MARK_TYPES: Record<TableauMarkType, TraceType | null> = {
      // A second dimension is a second series, whichever way the bars were laid
      // out — the summary data cannot tell a stack from a side-by-side.
      'bar': TraceType.DODGED,
      'line': TraceType.LINE,
      // Never `stacked_area`: each band carries its own value either way.
      'area': TraceType.AREA,
      'square': TraceType.HEATMAP,
      // The same primitive a categorical dot plot uses, so it is a point cloud
      // only when there are two measures to put on the axes.
      'circle': TraceType.SCATTER,
      'shape': TraceType.SCATTER,
      'pie': TraceType.PIE,
      'heatmap': TraceType.HEATMAP,
      // Refused rather than approximated: a gantt needs a start and an end
      // where the summary gives a duration, a map needs centroids and a
      // neighbour list Tableau does not expose, a text table has no magnitude
      // to sonify, and a viz extension is whatever its author made it.
      'gantt-bar': null,
      'text': null,
      'map': null,
      'polygon': null,
      'viz-extension': null,
    };

    const MAPPED = Object.entries(MARK_TYPES).filter(
      (entry): entry is [string, TraceType] => entry[1] !== null,
    );
    const REFUSED = Object.entries(MARK_TYPES)
      .filter(entry => entry[1] === null)
      .map(([mark]) => mark);

    /**
     * A worksheet every mark type can be classified against unchanged.
     *
     * Two dimensions and two measures over a complete 2×2 grid is the one shape
     * that satisfies every conditional branch at once: `circle` and `shape` need
     * a second measure before they are a point cloud, `square` and `heatmap`
     * need a grid with no holes, and `bar` needs a second dimension before it is
     * a grouped bar. Every reading below therefore differs because the mark type
     * differs and for no other reason.
     *
     * @param mark - The `primitiveType` to report, as Tableau spells it.
     * @returns The snapshot.
     */
    const markSnapshot = (mark: string): WorksheetSnapshot => fakeSnapshot({
      name: 'Marks',
      columns: [
        category(),
        region(),
        fakeColumn('SUM(Sales)', 'float', 2),
        fakeColumn('AVG(Profit)', 'float', 3),
      ],
      rows: [
        ['Chairs', 'East', 1, 10],
        ['Tables', 'East', 2, 20],
        ['Chairs', 'West', 3, 30],
        ['Tables', 'West', 4, 40],
      ],
      spec: fakeVisualSpec([mark]),
    });

    it('covers every member of the mark-type enum Tableau declares', () => {
      // Thirteen in contract 1.211.0, and no `Automatic` among them: Tableau
      // resolves that at authoring time to whatever it went on to draw.
      expect(Object.keys(MARK_TYPES)).toHaveLength(13);
      expect(MAPPED.length + REFUSED.length).toBe(13);
    });

    it.each(MAPPED)('reads %s marks as a %s layer', (mark, expected) => {
      const extraction = extractTableau([markSnapshot(mark)]);

      expect(layerOf(extraction).type).toBe(expected);
    });

    it.each(REFUSED)('skips a worksheet drawn with %s marks, rather than reading it as something it is not', (mark) => {
      const extraction = extractTableau([markSnapshot(mark)]);

      // These columns would happily build a grouped bar layer. Building one
      // would announce a chart the author never drew, which is worse for a
      // reader than being told the worksheet was left out.
      expect(extraction.maidr.subplots).toEqual([]);
      expect(extraction.selection.worksheets.size).toBe(0);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`is drawn with ${mark} marks`),
      );
    });

    it('reads bar marks over a single dimension as a plain bar, not a grouped one', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), measure()],
          rows: [['Chairs', 3], ['Tables', 1]],
          spec: fakeVisualSpec(['bar']),
        }),
      ]);

      expect(layerOf(extraction).type).toBe(TraceType.BAR);
    });

    it('never upgrades area marks to a stacked area, whatever the second dimension does', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), region(), measure()],
          rows: [
            ['Chairs', 'East', 1],
            ['Tables', 'East', 2],
            ['Chairs', 'West', 3],
            ['Tables', 'West', 4],
          ],
          spec: fakeVisualSpec(['area']),
        }),
      ]);

      // Summary data gives each band its own value for both layouts, so the
      // stack is not recoverable and claiming one would misreport every total.
      const layer = layerOf(extraction);
      expect(layer.type).toBe(TraceType.AREA);
      expect(layer.data as LinePoint[][]).toHaveLength(2);
    });

    it('falls through to the ladder for shape marks with nothing to put on a second axis', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), measure()],
          rows: [['Chairs', 3], ['Tables', 1]],
          spec: fakeVisualSpec(['shape']),
        }),
      ]);

      // MAIDR's point cloud demands numeric x and y; a categorical dot plot has
      // neither, so the columns decide instead of the primitive.
      expect(layerOf(extraction).type).toBe(TraceType.BAR);
    });

    it('falls back to grouped bars, with a warning, when square marks leave the grid with holes', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          name: 'Treemap',
          columns: [category(), region(), measure()],
          rows: [
            ['Chairs', 'East', 1],
            ['Tables', 'East', 2],
            ['Chairs', 'West', 3],
          ],
          spec: fakeVisualSpec(['square']),
        }),
      ]);

      // `HeatmapData` is a rectangle, and a hole filled with a zero is a value
      // the viz never drew.
      expect(layerOf(extraction).type).toBe(TraceType.DODGED);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('complete grid'));
    });

    it('outranks the ladder even where the ladder is confident', () => {
      const january = fakeValue(new Date('2021-01-01T00:00:00Z'), 'January 2021');
      const february = fakeValue(new Date('2021-02-01T00:00:00Z'), 'February 2021');

      const extraction = extractTableau([
        fakeSnapshot({
          columns: [month(), measure()],
          rows: [[january, 10], [february, 20]],
          spec: fakeVisualSpec(['bar']),
        }),
      ]);

      // A temporal category is the ladder's own signature for a line (C3). The
      // mark type is the only *direct* evidence of what was drawn, so it wins.
      expect(layerOf(extraction).type).toBe(TraceType.BAR);
    });

    it('reads pie marks as a pie chart, outranking the ladder’s bar', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), measure()],
          rows: [['Chairs', 3], ['Tables', 1]],
          spec: fakeVisualSpec(['pie']),
        }),
      ]);

      const layer = layerOf(extraction);
      expect(layer.type).toBe(TraceType.PIE);
      expect(layer.data as PiePoint[]).toEqual([
        { x: 'Chairs', y: 3 },
        { x: 'Tables', y: 1 },
      ]);
    });

    it('reads line marks as a line even when the category is a plain string', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), measure()],
          rows: [['Chairs', 3], ['Tables', 1]],
          spec: fakeVisualSpec(['line']),
        }),
      ]);

      expect(layerOf(extraction).type).toBe(TraceType.LINE);
    });

    it('reads heatmap marks over a complete grid as a heat map', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), region(), measure()],
          rows: [
            ['Chairs', 'East', 1],
            ['Tables', 'East', 2],
            ['Chairs', 'West', 3],
            ['Tables', 'West', 4],
          ],
          spec: fakeVisualSpec(['heatmap']),
        }),
      ]);

      const layer = layerOf(extraction);
      expect(layer.type).toBe(TraceType.HEATMAP);
      const data = layer.data as HeatmapData;
      expect(data.x).toEqual(['Chairs', 'Tables']);
      expect(data.y).toEqual(['East', 'West']);
      expect(data.points).toEqual([[1, 2], [3, 4]]);
      // `HeatmapData` is a rectangle, and the model indexes it as one.
      expect(data.points).toHaveLength(data.y.length);
      expect(data.points.every(row => row.length === data.x.length)).toBe(true);
    });

    it('falls back to grouped bars, with a warning, when the grid has holes', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          name: 'Highlight Table',
          columns: [category(), region(), measure()],
          rows: [
            ['Chairs', 'East', 1],
            ['Tables', 'East', 2],
            ['Chairs', 'West', 3],
          ],
          spec: fakeVisualSpec(['heatmap']),
        }),
      ]);

      expect(layerOf(extraction).type).toBe(TraceType.DODGED);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('complete grid'));
    });

    it('reads circle marks as a point cloud only when there are two measures', () => {
      const asPoints = extractTableau([
        fakeSnapshot({
          columns: [
            fakeColumn('Customer', 'string', 0),
            fakeColumn('SUM(Sales)', 'float', 1),
            fakeColumn('AVG(Profit)', 'float', 2),
          ],
          rows: [['Alice', 10, 1], ['Bob', 20, 2]],
          spec: fakeVisualSpec(['circle']),
        }),
      ]);
      const asBars = extractTableau([
        fakeSnapshot({
          columns: [category(), measure()],
          rows: [['Chairs', 3], ['Tables', 1]],
          spec: fakeVisualSpec(['circle']),
        }),
      ]);

      expect(layerOf(asPoints).type).toBe(TraceType.SCATTER);
      // A categorical dot plot uses the same primitive but has no numeric x.
      expect(layerOf(asBars).type).toBe(TraceType.BAR);
    });

    it('skips a worksheet drawn with marks MAIDR has no equivalent for', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          name: 'Map',
          columns: [category(), measure()],
          rows: [['Chairs', 3]],
          spec: fakeVisualSpec(['map']),
        }),
      ]);

      expect(extraction.maidr.subplots).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no equivalent'));
    });

    it('falls through to the ladder for a mark type it does not recognise', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), measure()],
          rows: [['Chairs', 3]],
          spec: fakeVisualSpec(['something-new']),
        }),
      ]);

      expect(layerOf(extraction).type).toBe(TraceType.BAR);
    });

    it('reads the marks card the specification says is active', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), measure()],
          rows: [['Chairs', 3]],
          spec: fakeVisualSpec(['bar', 'pie'], 1),
        }),
      ]);

      expect(layerOf(extraction).type).toBe(TraceType.PIE);
    });

    it('warns that a worksheet with several marks cards is read from one', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          name: 'Dual Axis',
          columns: [category(), measure()],
          rows: [['Chairs', 3]],
          spec: fakeVisualSpec(['bar', 'line'], 1),
        }),
      ]);

      // A dual-axis view has a card per measure, and nothing in the payload
      // says which axis a card belongs to — so one is read, out loud.
      expect(layerOf(extraction).type).toBe(TraceType.LINE);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('2 marks cards'));
    });

    it('falls back to the first marks card when the active index is out of range', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          name: 'Out Of Range',
          columns: [category(), measure()],
          rows: [['Chairs', 3]],
          spec: fakeVisualSpec(['pie'], 7),
        }),
      ]);

      // `activeMarksSpecificationIndex` is a bare `number` in the declarations,
      // constrained by nothing: an index the cards do not have is no reason to
      // throw away a worksheet whose only card is right there.
      expect(layerOf(extraction).type).toBe(TraceType.PIE);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('active marks card'));
    });

    it('falls back to the first marks card when the active index is fractional', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), measure()],
          rows: [['Chairs', 3]],
          spec: fakeVisualSpec(['pie'], 0.5),
        }),
      ]);

      expect(layerOf(extraction).type).toBe(TraceType.PIE);
    });

    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
      'falls back to the first marks card when the active index is %p',
      (activeIndex) => {
        const extraction = extractTableau([
          fakeSnapshot({
            columns: [category(), measure()],
            rows: [['Chairs', 3]],
            spec: fakeVisualSpec(['pie'], activeIndex),
          }),
        ]);

        expect(layerOf(extraction).type).toBe(TraceType.PIE);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('active marks card'));
      },
    );

    it('reads a specification with no marks cards through the ladder instead of throwing', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), measure()],
          rows: [['Chairs', 3], ['Tables', 1]],
          spec: fakeVisualSpec([], 0),
        }),
      ]);

      // `marksSpecifications` is required, so an empty array is a shape the
      // declarations permit — and indexing it at the equally required
      // `activeMarksSpecificationIndex` reads past the end. There is nothing to
      // report and nothing to complain about: the columns still describe a
      // chart.
      expect(layerOf(extraction).type).toBe(TraceType.BAR);
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('active marks card'),
      );
    });

    it('reads a fully populated payload by its mark type alone', () => {
      const segment = fakeField('Segment');
      const spec = fakeVisualSpec(
        [
          fakeMarksCard('bar', [
            // A discrete dimension on Color that is on neither shelf is the
            // shape Tableau produces for a *stacked* bar. The extractor still
            // reads grouped bars: nothing in the contract reports the Stack
            // Marks setting, so acting on this would be a claim about authoring
            // habits rather than a reading of a declared fact (#937).
            fakeEncoding('color', fakeField('Region')),
            fakeEncoding('detail', segment),
            fakeEncoding('tooltip', segment, { fieldEncodingId: 'tooltip:[Segment]:1' }),
          ]),
        ],
        0,
        {
          columnFields: [fakeField('Category')],
          rowFields: [
            fakeField('SUM(Sales)', {
              role: 'measure',
              aggregation: 'sum',
              columnType: 'continuous',
              dataType: 'float',
            }),
          ],
        },
      );

      const extraction = extractTableau([
        fakeSnapshot({
          name: 'Sales by Category and Region',
          columns: [category(), region(), measure()],
          rows: [
            ['Chairs', 'East', 1],
            ['Tables', 'East', 2],
            ['Chairs', 'West', 3],
            ['Tables', 'West', 4],
          ],
          spec,
        }),
      ]);

      expect(layerOf(extraction).type).toBe(TraceType.DODGED);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('overrides', () => {
    it('lets the page’s trace type outrank the visual specification', () => {
      const extraction = extractTableau(
        [
          fakeSnapshot({
            name: 'Sheet 1',
            columns: [category(), measure()],
            rows: [['Chairs', 3], ['Tables', 1]],
            spec: fakeVisualSpec(['bar']),
          }),
        ],
        { overrides: { 'Sheet 1': { traceType: TraceType.LINE } } },
      );

      expect(layerOf(extraction).type).toBe(TraceType.LINE);
    });

    it('lets the page’s trace type rescue a worksheet the mark type would refuse', () => {
      const extraction = extractTableau(
        [
          fakeSnapshot({
            name: 'Sheet 1',
            columns: [category(), measure()],
            rows: [['Chairs', 3], ['Tables', 1]],
            spec: fakeVisualSpec(['map']),
          }),
        ],
        { overrides: { 'Sheet 1': { traceType: TraceType.BAR } } },
      );

      // The refusal protects a reader from a chart MAIDR cannot honestly
      // describe; a page that says what the worksheet is has answered that.
      expect(layerOf(extraction).type).toBe(TraceType.BAR);
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('no equivalent'));
    });

    it('reaches a stacked bar, which is never inferred, only through the override', () => {
      const extraction = extractTableau(
        [
          fakeSnapshot({
            name: 'Sheet 1',
            columns: [category(), region(), measure()],
            rows: [
              ['Chairs', 'East', 1],
              ['Tables', 'East', 2],
              ['Chairs', 'West', 3],
              ['Tables', 'West', 4],
            ],
          }),
        ],
        { overrides: { 'Sheet 1': { traceType: TraceType.STACKED } } },
      );

      expect(layerOf(extraction).type).toBe(TraceType.STACKED);
      expect(layerOf(extraction).data as SegmentedPoint[][]).toHaveLength(2);
    });

    it('degrades an unbuildable override to the inferred type, with a warning', () => {
      const extraction = extractTableau(
        [
          fakeSnapshot({
            name: 'Sheet 1',
            columns: [category(), region(), measure()],
            rows: [
              ['Chairs', 'East', 1],
              ['Tables', 'East', 2],
              ['Chairs', 'West', 3],
            ],
          }),
        ],
        { overrides: { 'Sheet 1': { traceType: TraceType.HEATMAP } } },
      );

      // A truthful smaller reading beats a confident wrong one.
      expect(layerOf(extraction).type).toBe(TraceType.DODGED);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('cannot build'));
    });

    it('honours explicit x, y and z column choices', () => {
      const extraction = extractTableau(
        [
          fakeSnapshot({
            name: 'Sheet 1',
            columns: [
              category(),
              region(),
              fakeColumn('SUM(Sales)', 'float', 2),
              fakeColumn('SUM(Profit)', 'float', 3),
            ],
            rows: [
              ['Chairs', 'East', 1, 100],
              ['Chairs', 'West', 2, 200],
            ],
          }),
        ],
        { overrides: { 'Sheet 1': { x: 'Region', y: 'SUM(Profit)', z: 'Category' } } },
      );

      const layer = layerOf(extraction);
      expect(layer.axes).toEqual({
        x: { label: 'Region' },
        y: { label: 'Profit' },
        z: { label: 'Category' },
      });
      expect(layer.data as SegmentedPoint[][]).toEqual([
        [
          { x: 'East', y: 100, z: 'Chairs' },
          { x: 'West', y: 200, z: 'Chairs' },
        ],
      ]);
    });

    it('warns and falls back when an override names no column', () => {
      const extraction = extractTableau(
        [
          fakeSnapshot({
            name: 'Sheet 1',
            columns: [category(), measure()],
            rows: [['Chairs', 3]],
          }),
        ],
        { overrides: { 'Sheet 1': { y: 'SUM(Nope)' } } },
      );

      expect(layerOf(extraction).axes?.y).toEqual({ label: 'Sales' });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('no measure column named "SUM(Nope)"'),
      );
    });

    it('overrides the axis labels without touching which columns are read', () => {
      const extraction = extractTableau(
        [
          fakeSnapshot({
            name: 'Sheet 1',
            columns: [category(), measure()],
            rows: [['Chairs', 3]],
          }),
        ],
        { overrides: { 'Sheet 1': { axes: { x: 'Product', y: 'Revenue' } } } },
      );

      const layer = layerOf(extraction);
      expect(layer.axes).toEqual({ x: { label: 'Product' }, y: { label: 'Revenue' } });
      expect(layer.data as BarPoint[]).toEqual([{ x: 'Chairs', y: 3 }]);
    });

    it('titles a layer by the worksheet name unless the page renames it', () => {
      const snapshots = [
        fakeSnapshot({ name: 'Sales', columns: [category(), measure()], rows: [['Chairs', 3]] }),
      ];

      expect(layerOf(extractTableau(snapshots)).title).toBe('Sales');
      expect(
        layerOf(extractTableau(snapshots, { overrides: { Sales: { title: 'Revenue' } } })).title,
      ).toBe('Revenue');
    });

    it('emits orientation and step direction only when the page declares them', () => {
      const snapshots = [
        fakeSnapshot({ name: 'Sheet 1', columns: [category(), measure()], rows: [['Chairs', 3]] }),
      ];

      const inferred = layerOf(extractTableau(snapshots));
      expect(inferred.orientation).toBeUndefined();
      expect(inferred.stepDirection).toBeUndefined();

      const declared = layerOf(
        extractTableau(snapshots, {
          overrides: {
            'Sheet 1': { orientation: Orientation.HORIZONTAL, stepDirection: 'hv' },
          },
        }),
      );
      expect(declared.orientation).toBe(Orientation.HORIZONTAL);
      expect(declared.stepDirection).toBe('hv');
    });

    it('transposes a horizontal bar, so the magnitude is the value the model reads', () => {
      const extraction = extractTableau(
        [
          fakeSnapshot({
            name: 'Sheet 1',
            columns: [category(), measure()],
            rows: [['Chairs', 3], ['Tables', 1]],
          }),
        ],
        { overrides: { 'Sheet 1': { orientation: Orientation.HORIZONTAL } } },
      );

      const layer = layerOf(extraction);
      expect(layer.orientation).toBe(Orientation.HORIZONTAL);
      // `AbstractBarPlot` reads an oriented layer's magnitude off `point.x`.
      // Stamping the flag onto the vertical payload would give it
      // `Number('Chairs')`, i.e. `NaN` for every bar: no tone, no braille, and
      // "Min value: missing".
      expect(layer.data as BarPoint[]).toEqual([
        { x: 3, y: 'Chairs' },
        { x: 1, y: 'Tables' },
      ]);
      // The captions travel with the payload.
      expect(layer.axes).toEqual({ x: { label: 'Sales' }, y: { label: 'Category' } });
    });

    it('transposes a horizontal grouped bar, keeping the series order and the pad', () => {
      const extraction = extractTableau(
        [
          fakeSnapshot({
            name: 'Sheet 1',
            columns: [category(), region(), measure()],
            rows: [
              ['Chairs', 'East', 1],
              ['Tables', 'East', 2],
              ['Chairs', 'West', 3],
            ],
          }),
        ],
        { overrides: { 'Sheet 1': { orientation: Orientation.HORIZONTAL } } },
      );

      const layer = layerOf(extraction);
      expect(layer.type).toBe(TraceType.DODGED);
      // `[group][category]` is unchanged: `SegmentedTrace.createSummaryLevel()`
      // already reads the category off `y` when the trace is horizontal.
      expect(layer.data as SegmentedPoint[][]).toEqual([
        [
          { x: 1, y: 'Chairs', z: 'East' },
          { x: 2, y: 'Tables', z: 'East' },
        ],
        [
          { x: 3, y: 'Chairs', z: 'West' },
          { x: Number.NaN, y: 'Tables', z: 'West' },
        ],
      ]);
      expect(layer.axes).toEqual({
        x: { label: 'Sales' },
        y: { label: 'Category' },
        z: { label: 'Region' },
      });
    });

    it('leaves an explicit axis caption alone on a horizontal layer', () => {
      const extraction = extractTableau(
        [
          fakeSnapshot({
            name: 'Sheet 1',
            columns: [category(), measure()],
            rows: [['Chairs', 3]],
          }),
        ],
        {
          overrides: {
            'Sheet 1': {
              orientation: Orientation.HORIZONTAL,
              axes: { x: 'Revenue', y: 'Product' },
            },
          },
        },
      );

      // A page that hand-writes a caption is writing it for the axis as the
      // layer will actually emit it.
      expect(layerOf(extraction).axes).toEqual({
        x: { label: 'Revenue' },
        y: { label: 'Product' },
      });
    });

    it('does not transpose a family the model never orients', () => {
      const january = fakeValue(new Date('2021-01-01T00:00:00Z'), 'January 2021');

      const extraction = extractTableau(
        [
          fakeSnapshot({
            name: 'Sheet 1',
            columns: [month(), measure()],
            rows: [[january, 10]],
          }),
        ],
        { overrides: { 'Sheet 1': { orientation: Orientation.HORIZONTAL } } },
      );

      // `IS_ORIENTED` is false for the line family, so `LineTrace` never reads
      // `layer.orientation`; transposing here would only mislabel the axes.
      const layer = layerOf(extraction);
      expect(layer.data as LinePoint[][]).toEqual([[{ x: 'January 2021', y: 10 }]]);
      expect(layer.axes).toEqual({ x: { label: 'MONTH(Order Date)' }, y: { label: 'Sales' } });
    });

    it('reads a z override that names the only dimension as the category axis', () => {
      const extraction = extractTableau(
        [
          fakeSnapshot({
            name: 'Sales by Region',
            columns: [category('Region'), measure()],
            rows: [['East', 3], ['West', 1]],
          }),
        ],
        { overrides: { 'Sales by Region': { z: 'Region' } } },
      );

      // Grouping the only dimension away would leave nothing to navigate, and
      // the ladder would drop the worksheet reporting that it has no dimension
      // — which is false, and never names the override that caused it.
      const layer = layerOf(extraction);
      expect(layer.type).toBe(TraceType.BAR);
      expect(layer.data as BarPoint[]).toEqual([
        { x: 'East', y: 3 },
        { x: 'West', y: 1 },
      ]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('is the only dimension'));
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('no dimension to navigate'),
      );
    });
  });

  describe('the subplot grid', () => {
    it('lays worksheets out one per row, in the order they were read', () => {
      const extraction = extractTableau([
        fakeSnapshot({ name: 'A', columns: [category(), measure()], rows: [['Chairs', 1]] }),
        fakeSnapshot({ name: 'B', columns: [category(), measure()], rows: [['Tables', 2]] }),
        fakeSnapshot({ name: 'C', columns: [category(), measure()], rows: [['Phones', 3]] }),
      ]);

      expect(extraction.maidr.subplots).toHaveLength(3);
      expect(extraction.maidr.subplots.every(row => row.length === 1)).toBe(true);
      expect([0, 1, 2].map(index => layerOf(extraction, index).id)).toEqual(['0', '1', '2']);
      expect([0, 1, 2].map(index => layerOf(extraction, index).title)).toEqual(['A', 'B', 'C']);
    });

    it('skips a worksheet with no measure and contributes no subplot for it', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          name: 'Text Table',
          columns: [category(), region()],
          rows: [['Chairs', 'East'], ['Tables', 'West']],
        }),
      ]);

      expect(extraction.maidr.subplots).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no measure to sonify'));
    });

    it('skips a worksheet with no dimension to navigate', () => {
      const extraction = extractTableau([
        fakeSnapshot({ name: 'KPI', columns: [measure()], rows: [[42]] }),
      ]);

      expect(extraction.maidr.subplots).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no dimension to navigate'));
    });

    it('skips a worksheet that returned no rows', () => {
      const extraction = extractTableau([
        fakeSnapshot({ name: 'Filtered Out', columns: [category(), measure()], rows: [] }),
      ]);

      expect(extraction.maidr.subplots).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no rows'));
    });

    it('keeps layer ids contiguous when a worksheet in the middle is skipped', () => {
      const extraction = extractTableau([
        fakeSnapshot({ name: 'A', columns: [category(), measure()], rows: [['Chairs', 1]] }),
        fakeSnapshot({ name: 'B', columns: [category(), region()], rows: [['Tables', 'East']] }),
        fakeSnapshot({ name: 'C', columns: [category(), measure()], rows: [['Phones', 3]] }),
      ]);

      expect(extraction.maidr.subplots).toHaveLength(2);
      expect([0, 1].map(index => layerOf(extraction, index).id)).toEqual(['0', '1']);
      // The survivor index is what every selection lookup is keyed by, so the
      // map back to a worksheet has to come from the extractor.
      expect(extraction.selection.worksheets.get('0')).toBe('A');
      expect(extraction.selection.worksheets.get('1')).toBe('C');
    });

    it('emits no subplots at all when every worksheet is skipped', () => {
      const extraction = extractTableau(
        [
          fakeSnapshot({ name: 'A', columns: [category(), measure()], rows: [['Chairs', 1]] }),
          fakeSnapshot({ name: 'B', columns: [category(), measure()], rows: [['Tables', 2]] }),
        ],
        { overrides: { A: { skip: true }, B: { skip: true } } },
      );

      expect(extraction.maidr.subplots).toEqual([]);
      expect(extraction.selection.worksheets.size).toBe(0);
    });

    it('honours an include-list in the order the page wrote it', () => {
      const extraction = extractTableau(
        [
          fakeSnapshot({ name: 'A', columns: [category(), measure()], rows: [['Chairs', 1]] }),
          fakeSnapshot({ name: 'B', columns: [category(), measure()], rows: [['Tables', 2]] }),
          fakeSnapshot({ name: 'C', columns: [category(), measure()], rows: [['Phones', 3]] }),
        ],
        { worksheets: ['C', 'A'] },
      );

      expect([0, 1].map(index => layerOf(extraction, index).title)).toEqual(['C', 'A']);
    });

    it('warns about an include-list entry that names no worksheet that was read', () => {
      const extraction = extractTableau(
        [fakeSnapshot({ name: 'A', columns: [category(), measure()], rows: [['Chairs', 1]] })],
        { worksheets: ['A', 'Ghost'] },
      );

      expect(extraction.maidr.subplots).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no worksheet named "Ghost"'));
    });
  });

  describe('the figure', () => {
    it('never sets onNavigate: extraction is pure and the binder owns the callback', () => {
      const extraction = extractTableau([
        fakeSnapshot({ columns: [category(), measure()], rows: [['Chairs', 1]] }),
      ]);

      expect(extraction.maidr.onNavigate).toBeUndefined();
    });

    it('generates a figure id, and uses the page’s when it supplies one', () => {
      const snapshots = [
        fakeSnapshot({ columns: [category(), measure()], rows: [['Chairs', 1]] }),
      ];

      expect(extractTableau(snapshots).maidr.id).toMatch(/^maidr-tableau-\d+$/);
      expect(extractTableau(snapshots, { id: 'pinned' }).maidr.id).toBe('pinned');
    });

    it('emits a title only when the page supplies one', () => {
      const snapshots = [
        fakeSnapshot({ columns: [category(), measure()], rows: [['Chairs', 1]] }),
      ];

      expect(extractTableau(snapshots).maidr.title).toBeUndefined();
      expect(extractTableau(snapshots, { title: 'Superstore' }).maidr.title).toBe('Superstore');
    });

    it('always describes an axis as an object with a label, never as a bare string', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), region(), measure()],
          rows: [['Chairs', 'East', 1], ['Tables', 'West', 2]],
        }),
      ]);

      // A bare string is not accepted by the grammar and degrades the label to
      // `'X'` at runtime.
      expect(layerOf(extraction).axes).toEqual({
        x: { label: 'Category' },
        y: { label: 'Sales' },
        z: { label: 'Region' },
      });
    });

    it('names a point cloud’s axes after its measures, not after its dimension', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [
            fakeColumn('Customer', 'string', 0),
            fakeColumn('SUM(Sales)', 'float', 1),
            fakeColumn('AVG(Profit)', 'float', 2),
            fakeColumn('SUM(Quantity)', 'float', 3),
          ],
          rows: [['Alice', 10, 1, 7], ['Bob', 20, 2, 8]],
        }),
      ]);

      expect(layerOf(extraction).axes).toEqual({
        x: { label: 'Sales' },
        y: { label: 'Profit' },
        z: { label: 'Quantity' },
      });
    });

    it('names a heat map’s z after the measure the cells are shaded by', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), region(), measure()],
          rows: [
            ['Chairs', 'East', 1],
            ['Tables', 'East', 2],
            ['Chairs', 'West', 3],
            ['Tables', 'West', 4],
          ],
          spec: fakeVisualSpec(['heatmap']),
        }),
      ]);

      expect(layerOf(extraction).axes).toEqual({
        x: { label: 'Category' },
        y: { label: 'Region' },
        z: { label: 'Sales' },
      });
    });

    it('never emits selectors: there is no DOM inside the viz to highlight', () => {
      const extraction = extractTableau([
        fakeSnapshot({ columns: [category(), measure()], rows: [['Chairs', 1]] }),
      ]);

      expect(layerOf(extraction).selectors).toBeUndefined();
    });

    it('warns once, naming them, about dimensions beyond the first two', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          name: 'Sheet 1',
          columns: [
            category(),
            region(),
            fakeColumn('Segment', 'string', 2),
            fakeColumn('SUM(Sales)', 'float', 3),
          ],
          rows: [
            ['Chairs', 'East', 'Consumer', 1],
            ['Tables', 'West', 'Corporate', 2],
          ],
        }),
      ]);

      expect(layerOf(extraction).type).toBe(TraceType.DODGED);
      const messages = warn.mock.calls.map(call => String(call[0]));
      expect(messages.filter(message => message.includes('"Segment"'))).toHaveLength(1);
    });
  });

  describe('the selection index', () => {
    it('addresses a bar layer as a single row of cells', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), measure()],
          rows: [['Chairs', 1], ['Tables', 2]],
        }),
      ]);

      const cells = extraction.selection.cells.get('0');
      expect(cells).toHaveLength(1);
      expect(cells?.[0][0]).toEqual([{ fieldName: 'Category', value: 'Chairs' }]);
      expect(cells?.[0][1]).toEqual([{ fieldName: 'Category', value: 'Tables' }]);
    });

    it('addresses a grouped cell by both dimensions, and a filler cell by nothing', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), region(), measure()],
          rows: [
            ['Chairs', 'East', 1],
            ['Tables', 'East', 2],
            ['Chairs', 'West', 3],
          ],
        }),
      ]);

      const cells = extraction.selection.cells.get('0');
      expect(cells?.[0][0]).toEqual([
        { fieldName: 'Category', value: 'Chairs' },
        { fieldName: 'Region', value: 'East' },
      ]);
      // The pad at `[West][Tables]` is the adapter's scaffolding, not a mark.
      expect(cells?.[1][1]).toBeNull();
    });

    it('addresses a date dimension as a single-day range', () => {
      const january = new Date('2021-01-01T00:00:00Z');
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [month(), measure()],
          rows: [[fakeValue(january, 'January 2021'), 10]],
        }),
      ]);

      expect(extraction.selection.cells.get('0')?.[0][0]).toEqual([
        { fieldName: 'MONTH(Order Date)', value: { min: january, max: january } },
      ]);
    });

    it('reverses a heat map’s rows to match how the model indexes the grid', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [category(), region(), measure()],
          rows: [
            ['Chairs', 'East', 1],
            ['Tables', 'East', 2],
            ['Chairs', 'West', 3],
            ['Tables', 'West', 4],
          ],
          spec: fakeVisualSpec(['heatmap']),
        }),
      ]);

      // `Heatmap`'s constructor reverses `y` and `points`, so row 0 is the
      // bottom band: an un-reversed index would select another row's marks.
      expect(extraction.selection.cells.get('0')?.[0][0]).toEqual([
        { fieldName: 'Category', value: 'Chairs' },
        { fieldName: 'Region', value: 'West' },
      ]);
    });

    it('addresses a point cloud by data index, using every dimension of the row', () => {
      const extraction = extractTableau([
        fakeSnapshot({
          columns: [
            fakeColumn('Customer', 'string', 0),
            fakeColumn('SUM(Sales)', 'float', 1),
            fakeColumn('AVG(Profit)', 'float', 2),
          ],
          rows: [['Alice', 10, 1], ['Bob', 20, 2]],
        }),
      ]);

      expect(extraction.selection.cells.has('0')).toBe(false);
      expect(extraction.selection.points.get('0')).toEqual([
        [{ fieldName: 'Customer', value: 'Alice' }],
        [{ fieldName: 'Customer', value: 'Bob' }],
      ]);
    });

    it('maps every layer id back to the worksheet it was built from', () => {
      const extraction = extractTableau([
        fakeSnapshot({ name: 'A', columns: [category(), measure()], rows: [['Chairs', 1]] }),
        fakeSnapshot({ name: 'B', columns: [category(), measure()], rows: [['Tables', 2]] }),
      ]);

      expect([...extraction.selection.worksheets]).toEqual([
        ['0', 'A'],
        ['1', 'B'],
      ]);
    });
  });
});
