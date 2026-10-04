/**
 * @jest-environment jsdom
 */

import type { ExcelChartSnapshot } from '../../../src/adapters/excel/types';
import type { Maidr } from '../../../src/type/grammar';
import { afterAll, describe, expect, it, jest } from '@jest/globals';
import { convertExcelChart } from '../../../src/adapters/excel/converter';
import { readChartExPart } from '../../../src/adapters/office/chartex';
import { parseXml } from '../../../src/adapters/office/xml';
import { TraceType } from '../../../src/type/grammar';
import { chartExSpace } from './chartXml';

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
afterAll(() => warn.mockRestore());

function read(xml: string): ExcelChartSnapshot {
  const document = parseXml(xml);
  const snapshot = document === null ? null : readChartExPart(document.documentElement);
  if (snapshot === null) {
    throw new Error('not a chart');
  }
  return snapshot;
}

function layers(maidr: Maidr | null): { type: string; data: unknown }[] {
  return (maidr?.subplots ?? []).flat().flatMap(subplot => subplot.layers.map(layer => ({ type: layer.type, data: layer.data })));
}

const AXES = '<cx:axis id="0"><cx:catScaling gapWidth="0"/><cx:title><cx:tx><cx:txData><cx:v>Score</cx:v></cx:txData></cx:tx></cx:title></cx:axis>'
  + '<cx:axis id="1"><cx:valScaling/><cx:title><cx:tx><cx:rich><a:bodyPr/><a:p><a:r><a:t>Students</a:t></a:r></a:p></cx:rich></cx:tx></cx:title></cx:axis>';

describe('readChartExPart', () => {
  it('should read a histogram\'s values and its bins as Office.js reports them', () => {
    const xml = chartExSpace(
      [{ values: [1, 2, 2, 3, 7] }],
      [{ layoutId: 'clusteredColumn', name: 'Scores', layout: '<cx:binning intervalClosed="r" underflow="1" overflow="auto"><cx:binSize val="2"/></cx:binning>' }],
      { title: 'Scores', axes: AXES },
    );

    const snapshot = read(xml);

    expect(snapshot).toEqual({
      chartType: 'Histogram',
      title: { text: 'Scores', visible: true },
      axes: { category: { title: { text: 'Score', visible: true } }, value: { title: { text: 'Students', visible: true } } },
      series: [{
        name: 'Scores',
        categories: ['', '', '', '', ''],
        values: ['1', '2', '2', '3', '7'],
        binOptions: { type: 'BinWidth', width: 2, allowUnderflow: true, underflowValue: 1 },
      }],
    });
    expect(layers(convertExcelChart(snapshot)).map(layer => layer.type)).toEqual([TraceType.HISTOGRAM]);
  });

  it.each([
    ['<cx:binning intervalClosed="r"><cx:binCount val="4"/></cx:binning>', { type: 'BinCount', count: 4 }],
    ['<cx:binning intervalClosed="r"/>', { type: 'Auto' }],
    ['<cx:aggregation/>', { type: 'Category' }],
    ['', { type: 'Auto' }],
  ])('should read binning %s', (layout, options) => {
    const xml = chartExSpace([{ values: [1, 2, 3] }], [{ layoutId: 'clusteredColumn', layout }]);

    expect(read(xml).series[0].binOptions).toEqual(options);
  });

  it('should read a Pareto chart as its columns, the line being worked out from them', () => {
    const xml = chartExSpace(
      [{ categories: [['Late', 'Lost', 'Broken']], values: [12, 5, 3] }],
      [{ layoutId: 'clusteredColumn', name: 'Complaints', layout: '<cx:aggregation/>' }, { layoutId: 'paretoLine', dataId: 0 }],
    );

    const snapshot = read(xml);

    expect(snapshot.chartType).toBe('Pareto');
    expect(snapshot.series).toHaveLength(1);
    expect(layers(convertExcelChart(snapshot)).map(layer => layer.type)).toEqual([TraceType.BAR, TraceType.LINE]);
  });

  it('should read a box and whisker chart\'s quartile method, each series a box per category', () => {
    const inclusive = chartExSpace(
      [{ categories: [['A', 'A', 'B', 'B']], values: [1, 2, 3, 4] }, { categories: [['A', 'A', 'B', 'B']], values: [2, 3, 4, 5] }],
      [
        { layoutId: 'boxWhisker', name: 'One', layout: '<cx:statistics quartileMethod="inclusive"/>' },
        { layoutId: 'boxWhisker', name: 'Two', dataId: 1, layout: '<cx:statistics quartileMethod="inclusive"/>' },
      ],
    );
    const exclusive = inclusive.replace(/quartileMethod="inclusive"/g, 'quartileMethod="exclusive"');

    expect(read(inclusive).series.map(one => [one.name, one.quartileCalculation])).toEqual([['One', 'Inclusive'], ['Two', 'Inclusive']]);
    expect(read(exclusive).series[0].quartileCalculation).toBe('Exclusive');
    expect(layers(convertExcelChart(read(inclusive)))[0].type).toBe(TraceType.BOX);
  });

  it('should read a waterfall\'s points set as totals, which Office.js does not report', () => {
    const xml = chartExSpace(
      [{ categories: [['Start', 'Sales', 'Costs', 'End']], values: [100, 50, -30, 120] }],
      [{ layoutId: 'waterfall', name: 'Cash', layout: '<cx:subtotals><cx:idx val="0"/><cx:idx val="3"/></cx:subtotals>' }],
    );

    const snapshot = read(xml);

    expect(snapshot.series[0].totals).toEqual([0, 3]);
    expect(layers(convertExcelChart(snapshot))[0]).toEqual({
      type: TraceType.WATERFALL,
      data: [
        { x: 'Start', start: 0, end: 100, delta: 100, kind: 'total' },
        { x: 'Sales', start: 100, end: 150, delta: 50, kind: 'increase' },
        { x: 'Costs', start: 150, end: 120, delta: -30, kind: 'decrease' },
        { x: 'End', start: 0, end: 120, delta: 120, kind: 'total' },
      ],
    });
  });

  it('should number the steps of a waterfall or funnel that names none, as Excel does', () => {
    const xml = chartExSpace([{ values: [30, 20, 10] }], [{ layoutId: 'funnel', name: 'Leads' }]);

    const snapshot = read(xml);

    expect(snapshot.chartType).toBe('Funnel');
    expect(snapshot.series[0].categories).toEqual(['1', '2', '3']);
  });

  it('should read a treemap\'s levels, outer first, a blank outer label carried down', () => {
    const xml = chartExSpace(
      [{ categories: [['Fruit', null, 'Veg'], ['Apple', 'Pear', 'Kale']], values: [5, 3, 2], valueType: 'size' }],
      [{ layoutId: 'treemap', name: 'Stock' }],
    );

    const snapshot = read(xml);

    expect(snapshot.chartType).toBe('Treemap');
    expect(snapshot.categoryLevels).toEqual([['Fruit', 'Apple'], ['Fruit', 'Pear'], ['Veg', 'Kale']]);
    expect(snapshot.series[0].categories).toEqual(['Fruit Apple', 'Fruit Pear', 'Veg Kale']);
    expect(layers(convertExcelChart(snapshot))[0]).toEqual({
      type: TraceType.TREEMAP,
      data: [
        { x: 'Apple', y: 5, path: ['Fruit'] },
        { x: 'Pear', y: 3, path: ['Fruit'] },
        { x: 'Kale', y: 2, path: ['Veg'] },
      ],
    });
  });

  it('should read a sunburst and a map', () => {
    const sunburst = chartExSpace(
      [{ categories: [['A', 'A'], ['x', 'y']], values: [1, 2], valueType: 'size' }],
      [{ layoutId: 'sunburst', name: 'S' }],
    );
    const map = chartExSpace(
      [{ categories: [['France', 'Spain']], values: [67, 48] }],
      [{ layoutId: 'regionMap', name: 'Population' }],
    );

    expect(read(sunburst).chartType).toBe('Sunburst');
    expect(layers(convertExcelChart(read(map)))).toEqual([
      { type: TraceType.CHOROPLETH, data: [{ x: 'France', y: 67 }, { x: 'Spain', y: 48 }] },
    ]);
  });

  it('should leave out a hidden series, and name an unnamed one as Excel does', () => {
    const xml = chartExSpace(
      [{ values: [1] }, { values: [2] }],
      [{ layoutId: 'boxWhisker', hidden: true }, { layoutId: 'boxWhisker', dataId: 1 }],
    );

    expect(read(xml).series).toEqual([{ name: 'Series1', categories: [''], values: ['2'], quartileCalculation: 'Exclusive' }]);
  });

  it('should read numeric categories as General writes them', () => {
    const xml = chartExSpace(
      [{ categories: [[2023, 2024]], values: [1, 2], numericCategories: true }],
      [{ layoutId: 'funnel', name: 'F' }],
    );

    expect(read(xml).series[0].categories).toEqual(['2023', '2024']);
  });

  it('should read a layout MAIDR does not know as Invalid', () => {
    const xml = chartExSpace([{ values: [1] }], [{ layoutId: 'spiral' }]);

    expect(read(xml)).toEqual({ chartType: 'Invalid', series: [] });
  });

  it('should not read a part that is not a chartEx part', () => {
    const document = parseXml('<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>');

    expect(document === null ? undefined : readChartExPart(document.documentElement)).toBeNull();
  });
});
