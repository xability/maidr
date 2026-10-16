/**
 * @jest-environment jsdom
 */

import type { GanttData, LinePoint, PiePoint, ScatterPoint, TreemapPoint } from '@type/grammar';
import { describe, expect, it } from '@jest/globals';
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
    const layer = layersOf(convert('quadrantChart', {
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
    }))[0];
    expect(layer.data as ScatterPoint[]).toEqual([{ x: 0.1, y: 0.1, label: 'A' }, { x: 0.75, y: 0.75, label: 'B' }]);
    expect(layer.axes?.x?.label).toBe('Low to High');
    expect(layer.title).toBe('Quadrants: Expand (top right); Promote (top left)');
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

  it('reads a journey as scores per section, with who takes part', () => {
    const layer = layersOf(convert('journey', {
      getTasks: () => [{ section: 'Go to work', task: 'Make tea', score: 5, people: ['Me'] }],
    }))[0];
    expect((layer.data as LinePoint[][])[0][0]).toEqual({ x: 'Make tea (Me)', y: 5, z: 'Go to work', label: '5, happy' });
  });

  it('reads a treemap\'s sections and sized items', () => {
    const layer = layersOf(convert('treemap', {
      getRoot: () => ({ name: '', children: [{ name: 'A', children: [{ name: 'A1', value: 10 }] }] }),
    }))[0];
    expect(layer.type).toBe(TraceType.TREEMAP);
    expect(layer.data as TreemapPoint[]).toEqual([{ x: 'A' }, { x: 'A1', path: ['A'], y: 10 }]);
  });
});
