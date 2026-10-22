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

  it('reads a packet as bit intervals, one lane per row', () => {
    const layer = layersOf(convert('packet', {
      getPacket: () => [[{ start: 0, end: 15, label: 'Source Port' }, { start: 16, end: 31, label: 'Destination Port' }]],
    }))[0];
    expect((layer.data as GanttData).points[0]).toEqual([
      { x: 'Bits 0 to 31', start: 0, end: 16, label: 'Source Port' },
      { x: 'Bits 0 to 31', start: 16, end: 32, label: 'Destination Port' },
    ]);
  });

  it('recovers a quadrant chart\'s values from its laid-out points, in declared order', () => {
    const figure = convert('quadrantChart', {
      getDiagramTitle: () => 'Reach',
      getQuadrantData: () => ({
        quadrants: [
          { x: 50, y: 0, width: 50, height: 50, text: { text: 'Expand' } },
          { x: 0, y: 0, width: 50, height: 50, text: { text: 'Promote' } },
          { x: 0, y: 50, width: 50, height: 50, text: { text: '' } },
          { x: 50, y: 50, width: 50, height: 50, text: { text: '' } },
        ],
        // Mermaid prepends each point it is given.
        points: [{ x: 75, y: 25, text: { text: 'B' } }, { x: 10, y: 90, text: { text: 'A' } }],
        axisLabels: [{ text: 'Low' }, { text: 'High' }, { text: 'Bottom' }, { text: 'Top' }],
      }),
    });
    const layer = layersOf(figure)[0];
    expect(layer.data as ScatterPoint[]).toEqual([{ x: 0.1, y: 0.1, label: 'A' }, { x: 0.75, y: 0.75, label: 'B' }]);
    expect(layer.axes?.x?.label).toBe('Low to High');
    // The layer title would name the chart in place of the diagram's title.
    expect(layer.title).toBeUndefined();
    expect(figure.title).toBe('Reach');
    expect(figure.subtitle).toBe('Quadrants: Expand (top right); Promote (top left)');
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
});
