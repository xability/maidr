/**
 * @jest-environment jsdom
 */

import type { GanttData, LinePoint, PiePoint, ScatterPoint, TreemapPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { convertMermaidDiagram } from '@adapters/mermaid/converter';
import { describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import { convert, drawn, layersOf, matched } from './helpers';

/**
 * The charts (`diagrams/charts.ts`): pie, gantt, packet, quadrant, XY, journey and treemap.
 *
 * Stand-in databases shaped as Mermaid 12's; see `./helpers`.
 */

describe('the charts', () => {
  it('reads a pie, outlining slices only when every one was drawn', () => {
    const svg = drawn('pie', '<path class="pieCircle"></path><path class="pieCircle"></path>');
    const layer = layersOf(convert('pie', { getSections: () => new Map([['Dogs', 386], ['Cats', 85]]) }, svg))[0];
    expect(layer.data as PiePoint[]).toEqual([{ x: 'Dogs', y: 386 }, { x: 'Cats', y: 85 }]);
    expect(layer.selectors).toBe('#pie path.pieCircle');
    const tiny = layersOf(convert('pie', { getSections: () => new Map([['Dogs', 386], ['Cats', 85], ['Rats', 1]]) }, svg))[0];
    expect(tiny.selectors).toBeUndefined();
  });

  it('reads a gantt as days per section, with each task\'s status', () => {
    const day = (n: number): Date => new Date(Date.UTC(2024, 0, n));
    const layer = layersOf(convert('gantt', {
      getTasks: () => [
        { id: 'a1', task: 'Design ', section: 'Plan', startTime: day(1), endTime: day(11), done: true },
        { id: 'a2', task: 'Build', section: 'Make', startTime: day(11), endTime: day(31), crit: true },
      ],
    }, drawn('g', '<rect id="g-a1"></rect><rect id="g-a2"></rect>')))[0];
    const data = layer.data as GanttData;
    expect(data.lanes).toEqual(['Plan', 'Make']);
    expect(data.unit).toBe('days');
    expect(data.points[0][0]).toMatchObject({ x: 'Plan', label: 'Design (done)' });
    expect(data.points[0][0].end - data.points[0][0].start).toBe(10);
    expect(data.points[1][0].label).toBe('Build (critical)');
    expect(matched(layer)).toBe(2);
  });

  it('reads a packet as bit intervals, one lane per row, each ending on its last bit', () => {
    const layer = layersOf(convert('packet', {
      getPacket: () => [
        [{ start: 0, end: 15, label: 'Source Port' }, { start: 16, end: 31, label: 'Destination Port' }],
        [{ start: 32, end: 32, label: 'Flag' }],
      ],
    }))[0];
    expect(layer.type).toBe(TraceType.GANTT);
    expect(layer.typeLabel).toBe('Packet Diagram');
    const data = layer.data as GanttData;
    expect(data.points).toEqual([
      [
        { x: 'Bits 0 to 31', start: 0, end: 15, label: 'Source Port' },
        { x: 'Bits 0 to 31', start: 16, end: 31, label: 'Destination Port' },
      ],
      [{ x: 'Bits 32 to 32', start: 32, end: 32, label: 'Flag' }],
    ]);
    expect(data.inclusive).toBe(true);
    // A database with no configuration says nothing of how its rows are drawn.
    expect(data.wrap).toBeUndefined();
  });

  it('folds a packet\'s bits into the rows Mermaid draws, left to right', () => {
    const wrapOf = (config: object): number | undefined => (layersOf(convert('packet', {
      getPacket: () => [[{ start: 0, end: 15, label: 'Port' }]],
      getConfig: () => config,
    }))[0].data as GanttData).wrap;
    expect(wrapOf({ bitsPerRow: 32 })).toBe(32);
    expect(wrapOf({ bitsPerRow: 16 })).toBe(16);
    expect(wrapOf({ bitsPerRow: 32, bitOrder: 'descending' })).toBeUndefined();
    expect(wrapOf({ bitsPerRow: 0 })).toBeUndefined();
  });

  /** A quadrant chart's database, its points as Mermaid lays them out. */
  const quadrantDb = {
    getDiagramTitle: () => 'Reach',
    getQuadrantData: () => ({
      quadrants: [
        { x: 50, y: 0, width: 50, height: 50, text: { text: 'Expand' } },
        { x: 0, y: 0, width: 50, height: 50, text: { text: 'Promote' } },
        { x: 0, y: 50, width: 50, height: 50, text: { text: '' } },
        { x: 50, y: 50, width: 50, height: 50, text: { text: '' } },
      ],
      // Mermaid prepends each point it is given, so B was declared after A.
      points: [{ x: 75, y: 25, text: { text: 'B' } }, { x: 10, y: 90, text: { text: 'A' } }],
      axisLabels: [{ text: 'Low' }, { text: 'High' }, { text: 'Bottom' }, { text: 'Top' }],
    }),
  };

  it('recovers a quadrant chart\'s values from its laid-out points, in the order Mermaid draws them', () => {
    const figure = convert('quadrantChart', quadrantDb);
    const layer = layersOf(figure)[0];
    expect(layer.data as ScatterPoint[]).toEqual([{ x: 0.75, y: 0.75, label: 'B' }, { x: 0.1, y: 0.1, label: 'A' }]);
    expect(layer.axes?.x?.label).toBe('Low to High');
    // The layer title would name the chart in place of the diagram's title.
    expect(layer.title).toBeUndefined();
    expect(figure.title).toBe('Reach');
    expect(figure.subtitle).toBe('Quadrants: Expand (top right); Promote (top left)');
  });

  it('pairs each quadrant point with the mark Mermaid drew for it', () => {
    // Drawn as Mermaid draws them: one group per laid-out point, in its order.
    const svg = drawn('q', '<g class="data-point"><circle></circle><text>B</text></g>'
      + '<g class="data-point"><circle></circle><text>A</text></g>');
    const layer = layersOf(convert('quadrantChart', quadrantDb, svg))[0];
    expect(layer.selectors).toBe('#q g.data-point circle');
    expect(matched(layer)).toBe(2);
    // Point and grid navigation outline the i-th match for the i-th point.
    expect((layer.data as ScatterPoint[]).map(point => point.label))
      .toEqual([...svg.querySelectorAll('g.data-point text')].map(text => text.textContent));
  });

  it('names no quadrants when the chart labels none, and lets the author\'s subtitle stand', () => {
    const quadrants = (text: string): object => ({
      getQuadrantData: () => ({
        quadrants: [{ x: 0, y: 0, width: 50, height: 50, text: { text } }],
        points: [{ x: 10, y: 10, text: { text: 'A' } }],
      }),
    });
    expect(convert('quadrantChart', quadrants('')).subtitle).toBeUndefined();
    const authored = convertMermaidDiagram({ type: 'quadrantChart', db: quadrants('Expand') }, drawn('q'), { subtitle: 'Mine' });
    expect(authored.subtitle).toBe('Mine');
  });

  it('reads an XY chart as one layer per plot', () => {
    const layers = layersOf(convert('xychart', {
      getXYChartData: () => ({
        xAxis: { type: 'band', categories: ['jan', 'feb'] },
        yAxis: { title: 'Revenue' },
        plots: [
          { type: 'bar', data: [['jan', 5], ['feb', 6]] },
          { type: 'line', data: [['jan', 5], ['feb', 6]] },
        ],
      }),
    }));
    expect(layers.map(layer => layer.type)).toEqual([TraceType.BAR, TraceType.LINE]);
    expect(layers[0].axes?.x?.label).toBe('Category');
    expect((layers[1].data as LinePoint[][])[0]).toEqual([{ x: 'jan', y: 5 }, { x: 'feb', y: 6 }]);
  });

  it('reads a journey as one line of scores across its sections, with who takes part', () => {
    const layer = layersOf(convert('journey', {
      getTasks: () => [
        { section: 'Go to work', task: 'Make tea', score: 5, people: ['Me'] },
        { section: 'Go to work', task: 'Do work', score: 1, people: ['Me', 'Cat'] },
        { section: 'Go home', task: 'Go downstairs', score: 5, people: ['Me'] },
      ],
    }))[0];
    // One line, so a reader walks from one section into the next and every
    // score is pitched on the same range.
    expect(layer.data as LinePoint[][]).toEqual([[
      { x: 'Make tea (Me)', y: 5, z: 'Go to work', label: '5, happy' },
      { x: 'Do work (Me, Cat)', y: 1, z: 'Go to work', label: '1, unhappy' },
      { x: 'Go downstairs (Me)', y: 5, z: 'Go home', label: '5, happy' },
    ]]);
    expect(layer.axes?.z).toEqual({ label: 'Section' });

    // The last 5 sounds as high as the first and pans at the timeline's end;
    // in a section of its own it was the bottom of a range of one.
    const trace = TraceFactory.create(layer);
    trace.moveToIndex(0, 2);
    const { audio } = trace.state as NonEmptyTraceState;
    expect(audio.freq).toMatchObject({ min: 1, max: 5, raw: 5 });
    expect(audio.panning).toMatchObject({ x: 2, cols: 3 });
    trace.dispose();
  });

  it('keeps a journey\'s tasks in the order Mermaid draws them, whatever their sections', () => {
    const layer = layersOf(convert('journey', {
      getTasks: () => [
        { section: 'A', task: 'One', score: 3 },
        { section: 'B', task: 'Two', score: 4 },
        { section: 'A', task: 'Three', score: 2 },
      ],
    }))[0];
    expect((layer.data as LinePoint[][])[0].map(point => [point.x, point.z])).toEqual([['One', 'A'], ['Two', 'B'], ['Three', 'A']]);
  });

  it('outlines each journey task by the face Mermaid draws at its score', () => {
    // A group per task, in the order of the tasks, sections A, B and A again.
    const task = (score: number): string => `<g><line class="task-line"></line><circle class="face" data-score="${score}"></circle>`
      + '<g><circle></circle><circle></circle></g><rect class="task"></rect></g>';
    const tasks = [
      { section: 'A', task: 'One', score: 3 },
      { section: 'B', task: 'Two', score: 4 },
      { section: 'A', task: 'Three', score: 2 },
    ];
    const layer = layersOf(convert('journey', { getTasks: () => tasks }, drawn('j', tasks.map(one => task(one.score)).join(''))))[0];
    const selectors = layer.selectors as string[];
    expect(selectors).toHaveLength(1);
    expect([...document.querySelectorAll(selectors[0])].map(face => face.getAttribute('data-score'))).toEqual(['3', '4', '2']);

    // A face short, and the pairing would slip from there on.
    const short = layersOf(convert('journey', { getTasks: () => tasks }, drawn('j', task(3) + task(4))))[0];
    expect(short.selectors).toBeUndefined();
  });

  it('names no section for a journey that declares none', () => {
    const layer = layersOf(convert('journey', { getTasks: () => [{ section: '', task: 'Make tea', score: 5 }] }))[0];
    expect((layer.data as LinePoint[][])[0]).toEqual([{ x: 'Make tea', y: 5, label: '5, happy' }]);
    expect(layer.axes?.z).toBeUndefined();
  });

  it('reads a treemap\'s sections and sized items', () => {
    const layer = layersOf(convert('treemap', {
      getRoot: () => ({ name: '', children: [{ name: 'A', children: [{ name: 'A1', value: 10 }] }] }),
    }))[0];
    expect(layer.type).toBe(TraceType.TREEMAP);
    expect(layer.data as TreemapPoint[]).toEqual([{ x: 'A' }, { x: 'A1', path: ['A'], y: 10 }]);
  });

  describe('a treemap\'s highlight', () => {
    /** Two sections, declared smaller first, each holding an item named Other. */
    const db = {
      getRoot: () => ({
        name: '',
        children: [
          { name: 'Small', children: [{ name: 'Other', value: 5 }, { name: 'Alpha', value: 4 }] },
          { name: 'Big', children: [{ name: 'Other', value: 50 }, { name: 'Beta', value: 20 }] },
        ],
      }),
    };
    const section = (test: string, label: string): string => `<g class="treemapSection" data-test="${test}">`
      + '<rect class="treemapSectionHeader"></rect><rect class="treemapSection"></rect>'
      + `<text class="treemapSectionLabel">${label}</text></g>`;
    const item = (test: string, label: string): string => `<g class="treemapNode treemapLeafGroup" data-test="${test}">`
      + `<rect class="treemapLeaf"></rect><text class="treemapLabel">${label}</text></g>`;
    /**
     * Drawn as Mermaid draws it, largest first: the hidden root and the
     * sections breadth first, then the items depth first.
     */
    const drawing = (bigLabel = 'Big', items = [item('big-other', 'Other'), item('big-beta', 'Beta'), item('small-other', 'Other'), item('small-alpha', 'Alpha')]): SVGSVGElement =>
      drawn('t', section('root', '') + section('big', bigLabel) + section('small', 'Small') + items.join(''));
    /** The group each selector's element sits in. */
    const groups = (selectors: unknown): (string | null | undefined)[] =>
      (selectors as string[]).map(one => document.querySelector(one)?.closest('g')?.getAttribute('data-test'));

    it('pairs each section and item with its rectangle, in the order Mermaid sorts them', () => {
      const layer = layersOf(convert('treemap', db, drawing()))[0];
      // Read in declared order: Small and its items, then Big and its items.
      expect((layer.data as TreemapPoint[]).map(point => point.x)).toEqual(['Small', 'Other', 'Alpha', 'Big', 'Other', 'Beta']);
      expect((layer.selectors as string[]).map(one => document.querySelector(one)?.getAttribute('class')))
        .toEqual(['treemapSection', 'treemapLeaf', 'treemapLeaf', 'treemapSection', 'treemapLeaf', 'treemapLeaf']);
      expect(groups(layer.selectors)).toEqual(['small', 'small-other', 'small-alpha', 'big', 'big-other', 'big-beta']);
    });

    it('pairs a section whose name Mermaid cut to fit its header', () => {
      const layer = layersOf(convert('treemap', db, drawing('Bi...')))[0];
      expect(groups(layer.selectors)[3]).toBe('big');
    });

    it('is withdrawn when the drawing disagrees with the order it is read in', () => {
      const swapped = [item('big-beta', 'Beta'), item('big-other', 'Other'), item('small-other', 'Other'), item('small-alpha', 'Alpha')];
      expect(layersOf(convert('treemap', db, drawing('Big', swapped)))[0].selectors).toBeUndefined();
      const missing = [item('big-other', 'Other'), item('big-beta', 'Beta'), item('small-other', 'Other')];
      expect(layersOf(convert('treemap', db, drawing('Big', missing)))[0].selectors).toBeUndefined();
    });
  });
});
