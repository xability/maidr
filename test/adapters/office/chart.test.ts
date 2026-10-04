/**
 * @jest-environment jsdom
 */

import type { ExcelChartSnapshot } from '../../../src/adapters/excel/types';
import type { Maidr } from '../../../src/type/grammar';
import { afterAll, describe, expect, it, jest } from '@jest/globals';
import { convertExcelChart } from '../../../src/adapters/excel/converter';
import { readChartPart } from '../../../src/adapters/office/chart';
import { parseXml } from '../../../src/adapters/office/xml';
import { TraceType } from '../../../src/type/grammar';
import { axIds, catAx, chartSpace, dateAx, multiLevel, numRef, ser, serAx, strRef, valAx } from './chartXml';

// The converter warns on purpose about what it leaves out.
const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
afterAll(() => warn.mockRestore());

const QUARTERS = strRef(['Q1', 'Q2', 'Q3', 'Q4'], 'Sheet1!$A$2:$A$5');
const AXES = catAx({ id: 1, cross: 2 }) + valAx({ id: 2, cross: 1 });
const NO_LINE = '<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr>';
const NO_MARKER = '<c:marker><c:symbol val="none"/></c:marker>';

function read(xml: string): ExcelChartSnapshot {
  const document = parseXml(xml);
  if (document === null) {
    throw new Error('not XML');
  }
  const snapshot = readChartPart(document.documentElement);
  if (snapshot === null) {
    throw new Error('not a chart');
  }
  return snapshot;
}

function layers(maidr: Maidr | null): { type: string; data: unknown }[] {
  return (maidr?.subplots ?? []).flat().flatMap(subplot => subplot.layers.map(layer => ({ type: layer.type, data: layer.data })));
}

describe('readChartPart', () => {
  it('should read a clustered column chart as Excel.ChartType names it, every series from its cache', () => {
    const xml = chartSpace(`<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${
      ser({ idx: 0, name: 'North', cat: QUARTERS, val: numRef([120, 135, 150, 170]) })
    }${ser({ idx: 1, name: 'South', cat: QUARTERS, val: numRef([80, null, 110, 105]) })}${axIds(1, 2)}</c:barChart>${AXES}`, { title: 'Sales' });

    const snapshot = read(xml);

    expect(snapshot.chartType).toBe('ColumnClustered');
    expect(snapshot.title).toEqual({ text: 'Sales', visible: true });
    expect(snapshot.series).toEqual([
      { name: 'North', chartType: 'ColumnClustered', axisGroup: 'Primary', categories: ['Q1', 'Q2', 'Q3', 'Q4'], values: ['120', '135', '150', '170'] },
      { name: 'South', chartType: 'ColumnClustered', axisGroup: 'Primary', categories: ['Q1', 'Q2', 'Q3', 'Q4'], values: ['80', '', '110', '105'] },
    ]);
    expect(layers(convertExcelChart(snapshot)).map(layer => layer.type)).toEqual([TraceType.DODGED]);
  });

  it.each([
    ['bar', 'stacked', 'BarStacked'],
    ['bar', 'percentStacked', 'BarStacked100'],
    ['col', 'standard', 'ColumnClustered'],
    ['col', 'stacked', 'ColumnStacked'],
  ])('should name a %s chart grouped %s as %s', (direction, grouping, type) => {
    const xml = chartSpace(`<c:bar3DChart><c:barDir val="${direction}"/><c:grouping val="${grouping}"/>${
      ser({ idx: 0, name: 'A', cat: QUARTERS, val: numRef([1, 2, 3, 4]) })
    }${axIds(1, 2)}</c:bar3DChart>${AXES}`);

    expect(read(xml).chartType).toBe(type);
  });

  it('should tell a line with markers from one without, and read stacked lines', () => {
    const marked = chartSpace(`<c:lineChart><c:grouping val="standard"/>${
      ser({ idx: 0, name: 'A', cat: QUARTERS, val: numRef([1, 2, 3, 4]) })
    }<c:marker val="1"/>${axIds(1, 2)}</c:lineChart>${AXES}`);
    const plain = chartSpace(`<c:lineChart><c:grouping val="stacked"/>${
      ser({ idx: 0, name: 'A', cat: QUARTERS, val: numRef([1, 2, 3, 4]), extra: NO_MARKER })
    }${ser({ idx: 1, name: 'B', cat: QUARTERS, val: numRef([1, 1, 1, 1]), extra: NO_MARKER })}<c:marker val="1"/>${axIds(1, 2)}</c:lineChart>${AXES}`);

    expect(read(marked).chartType).toBe('LineMarkers');
    expect(read(plain).chartType).toBe('LineStacked');
    expect(layers(convertExcelChart(read(plain))).map(layer => layer.type)).toEqual([TraceType.STACKED_AREA]);
  });

  it('should read a pie\'s first slice angle and a doughnut', () => {
    const pie = chartSpace(`<c:pieChart><c:varyColors val="1"/>${
      ser({ idx: 0, name: 'Share', cat: strRef(['A', 'B', 'C']), val: numRef([50, 30, 20]) })
    }<c:firstSliceAng val="90"/></c:pieChart>`);
    const doughnut = chartSpace(`<c:doughnutChart><c:varyColors val="1"/>${
      ser({ idx: 0, name: 'Ring', cat: strRef(['A', 'B']), val: numRef([2, 1]) })
    }<c:firstSliceAng val="0"/><c:holeSize val="50"/></c:doughnutChart>`);

    expect(read(pie).series[0].firstSliceAngle).toBe(90);
    expect(read(pie).chartType).toBe('Pie');
    expect(read(doughnut).chartType).toBe('Doughnut');
    expect(layers(convertExcelChart(read(pie)))).toEqual([
      { type: TraceType.PIE, data: [{ x: 'A', y: 50 }, { x: 'B', y: 30 }, { x: 'C', y: 20 }] },
    ]);
  });

  it('should read a custom pie of pie split, which Office.js cannot report, into two plots', () => {
    const xml = chartSpace(`<c:ofPieChart><c:ofPieType val="pie"/><c:varyColors val="1"/>${
      ser({ idx: 0, name: 'Spend', cat: strRef(['Rent', 'Food', 'Fun', 'Gifts']), val: numRef([50, 30, 0, 20]) })
    }<c:splitType val="cust"/><c:custSplit><c:secondPiePt val="1"/><c:secondPiePt val="3"/></c:custSplit></c:ofPieChart>`);

    const snapshot = read(xml);

    expect(snapshot.chartType).toBe('PieOfPie');
    expect(snapshot.series[0]).toMatchObject({ splitType: 'SplitByCustomSplit', splitPoints: [1, 3] });
    // Fun has no slice; Food and Gifts, points 1 and 3, are the second plot.
    expect(layers(convertExcelChart(snapshot))).toEqual([
      { type: TraceType.PIE, data: [{ x: 'Rent', y: 50 }, { x: 'Other', y: 50 }] },
      { type: TraceType.PIE, data: [{ x: 'Food', y: 30 }, { x: 'Gifts', y: 20 }] },
    ]);
  });

  it('should read a bar of pie split by position, the last three when the part does not say how many', () => {
    const xml = chartSpace(`<c:ofPieChart><c:ofPieType val="bar"/>${
      ser({ idx: 0, name: 'S', cat: strRef(['A', 'B', 'C', 'D', 'E']), val: numRef([5, 4, 3, 2, 1]) })
    }<c:splitType val="auto"/></c:ofPieChart>`);

    const snapshot = read(xml);

    expect(snapshot.chartType).toBe('BarOfPie');
    expect(snapshot.series[0]).toMatchObject({ splitType: 'SplitByPosition', splitValue: 3 });
  });

  it('should read a scatter whose lines have no fill as markers only, and number its points when its x values are text', () => {
    const xml = chartSpace(`<c:scatterChart><c:scatterStyle val="lineMarker"/>${
      ser({ idx: 0, name: 'P', extra: NO_LINE, xVal: strRef(['a', 'b', 'c']), yVal: numRef([2.5, 3.5, 1.25]) })
    }${axIds(3, 4)}</c:scatterChart>${valAx({ id: 3, cross: 4, position: 'b', title: 'X' })}${valAx({ id: 4, cross: 3, title: 'Y' })}`);

    const snapshot = read(xml);

    expect(snapshot.chartType).toBe('XYScatter');
    expect(snapshot.series[0]).toMatchObject({ xValues: ['1', '2', '3'], yValues: ['2.5', '3.5', '1.25'] });
    expect(snapshot.axes).toEqual({ category: { title: { text: 'X', visible: true } }, value: { title: { text: 'Y', visible: true } } });
  });

  it.each([
    ['smoothMarker', '<c:smooth val="1"/>', '', 'XYScatterSmooth'],
    ['lineMarker', '', NO_MARKER, 'XYScatterLinesNoMarkers'],
    ['lineMarker', '', '', 'XYScatterLines'],
  ])('should name a scatter styled %s with lines as Excel does', (style, tail, extra, type) => {
    const xml = chartSpace(`<c:scatterChart><c:scatterStyle val="${style}"/>${
      ser({ idx: 0, name: 'P', extra, xVal: numRef([1, 2]), yVal: numRef([3, 4]), tail })
    }${axIds(3, 4)}</c:scatterChart>${valAx({ id: 3, cross: 4, position: 'b' })}${valAx({ id: 4, cross: 3 })}`);

    expect(read(xml).chartType).toBe(type);
  });

  it('should read a bubble chart\'s sizes', () => {
    const xml = chartSpace(`<c:bubbleChart>${
      ser({ idx: 0, name: 'Cities', xVal: numRef([1, 2, 3]), yVal: numRef([10, 20, 15]), bubbleSize: numRef([5, 15, 10]) })
    }<c:bubbleScale val="100"/>${axIds(3, 4)}</c:bubbleChart>${valAx({ id: 3, cross: 4, position: 'b' })}${valAx({ id: 4, cross: 3 })}`);

    const snapshot = read(xml);

    expect(snapshot.chartType).toBe('Bubble');
    expect(snapshot.series[0]).toMatchObject({ xValues: ['1', '2', '3'], yValues: ['10', '20', '15'], bubbleSizes: ['5', '15', '10'] });
  });

  it.each([
    ['filled', '', 'RadarFilled'],
    ['marker', '', 'RadarMarkers'],
    ['marker', NO_MARKER, 'Radar'],
  ])('should name a radar styled %s as Excel does', (style, extra, type) => {
    const xml = chartSpace(`<c:radarChart><c:radarStyle val="${style}"/>${
      ser({ idx: 0, name: 'Ann', extra, cat: strRef(['Speed', 'Power', 'Skill']), val: numRef([3, 4, 5]) })
    }${axIds(1, 2)}</c:radarChart>${AXES}`);

    expect(read(xml).chartType).toBe(type);
  });

  it('should read a stock chart with volume as Excel reads one: the volume first, then the prices', () => {
    const days = strRef(['Mon', 'Tue'], 'Sheet1!$A$2:$A$3');
    const xml = chartSpace(`<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${
      ser({ idx: 0, name: 'Volume', cat: days, val: numRef([100, 200]) })
    }${axIds(1, 2)}</c:barChart><c:stockChart>${
      ser({ idx: 1, name: 'Open', cat: days, val: numRef([10, 11]), extra: NO_LINE })
    }${ser({ idx: 2, name: 'High', cat: days, val: numRef([12, 13]), extra: NO_LINE })}${
      ser({ idx: 3, name: 'Low', cat: days, val: numRef([9, 10]), extra: NO_LINE })
    }${ser({ idx: 4, name: 'Close', cat: days, val: numRef([11, 12]), extra: NO_LINE })}<c:hiLowLines/><c:upDownBars/>${axIds(3, 4)}</c:stockChart>`
    + `${catAx({ id: 1, cross: 2 })}${valAx({ id: 2, cross: 1, title: 'Volume' })}${catAx({ id: 3, cross: 4, deleted: true })}${valAx({ id: 4, cross: 3, position: 'r', title: 'Price' })}`);

    const snapshot = read(xml);

    expect(snapshot.chartType).toBe('StockVOHLC');
    expect(snapshot.series.map(one => one.name)).toEqual(['Volume', 'Open', 'High', 'Low', 'Close']);
    expect(snapshot.axes?.secondaryValue).toEqual({ title: { text: 'Price', visible: true } });
    expect(layers(convertExcelChart(snapshot)).map(layer => layer.type)).toEqual([TraceType.CANDLESTICK, TraceType.BAR]);
  });

  it('should read a high-low-close stock chart', () => {
    const xml = chartSpace(`<c:stockChart>${
      ['High', 'Low', 'Close'].map((name, idx) => ser({ idx, name, cat: strRef(['Mon']), val: numRef([10 - idx]) })).join('')
    }${axIds(1, 2)}</c:stockChart>${AXES}`);

    expect(read(xml).chartType).toBe('StockHLC');
  });

  it('should read a contour chart and a 3-D surface\'s series axis', () => {
    const contour = chartSpace(`<c:surfaceChart><c:wireframe val="0"/>${
      ser({ idx: 0, name: 'Low', cat: strRef(['A', 'B']), val: numRef([1, 2]) })
    }${axIds(1, 2, 5)}</c:surfaceChart>${AXES}${serAx({ id: 5, cross: 2 })}`);
    const surface = chartSpace(`<c:surface3DChart><c:wireframe val="1"/>${
      ser({ idx: 0, name: 'Low', cat: strRef(['A', 'B']), val: numRef([1, 2]) })
    }${axIds(1, 2, 5)}</c:surface3DChart>${AXES}${serAx({ id: 5, cross: 2, title: 'Depth' })}`);

    expect(read(contour).chartType).toBe('SurfaceTopView');
    expect(read(surface).chartType).toBe('SurfaceWireframe');
    expect(read(surface).axes?.series).toEqual({ title: { text: 'Depth', visible: true } });
  });

  it('should read a combo chart: each series as its own group, those on the far axis as secondary', () => {
    const xml = chartSpace(`<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${
      ser({ idx: 0, name: 'Revenue', cat: QUARTERS, val: numRef([1, 2, 3, 4]) })
    }${axIds(1, 2)}</c:barChart><c:lineChart><c:grouping val="standard"/>${
      ser({ idx: 1, name: 'Margin', cat: QUARTERS, val: numRef([0.1, 0.2, 0.3, 0.2]), extra: NO_MARKER })
    }${axIds(3, 4)}</c:lineChart>${AXES}${catAx({ id: 3, cross: 4, deleted: true })}${valAx({ id: 4, cross: 3, position: 'r', title: 'Margin' })}`);

    const snapshot = read(xml);

    expect(snapshot.chartType).toBe('ColumnClustered');
    expect(snapshot.series.map(one => [one.name, one.chartType, one.axisGroup])).toEqual([
      ['Revenue', 'ColumnClustered', 'Primary'],
      ['Margin', 'Line', 'Secondary'],
    ]);
    expect(layers(convertExcelChart(snapshot)).map(layer => layer.type)).toEqual([TraceType.BAR, TraceType.LINE]);
  });

  it('should read the series of a group MAIDR does not know as Invalid, so the converter leaves them out', () => {
    const xml = chartSpace(`<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${
      ser({ idx: 0, name: 'Known', cat: QUARTERS, val: numRef([1, 2, 3, 4]) })
    }${axIds(1, 2)}</c:barChart><c:futureChart>${
      ser({ idx: 1, name: 'Unknown', cat: QUARTERS, val: numRef([1, 2, 3, 4]) })
    }${axIds(1, 2)}</c:futureChart>${AXES}`);

    const snapshot = read(xml);

    expect(snapshot.chartType).toBe('ColumnClustered');
    expect(snapshot.series[1]).toMatchObject({ name: 'Unknown', chartType: 'Invalid' });
    expect(read(chartSpace('<c:futureChart/>')).chartType).toBe('Invalid');
  });

  describe('titles', () => {
    const one = (name?: string): string => `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${
      ser({ idx: 0, ...(name === undefined ? {} : { name }), cat: QUARTERS, val: numRef([1, 2, 3, 4]) })
    }${axIds(1, 2)}</c:barChart>${AXES}`;

    it('should title a chart of one named series with its name, as Excel does when the title is automatic', () => {
      expect(read(chartSpace(one('Revenue'))).title).toEqual({ text: 'Revenue', visible: true });
    });

    it('should leave a deleted automatic title untitled, and an unnamed series named as Excel names it', () => {
      expect(read(chartSpace(one('Revenue'), { autoTitleDeleted: true })).title).toBeUndefined();
      const unnamed = read(chartSpace(one()));
      expect(unnamed.title).toBeUndefined();
      expect(unnamed.series[0].name).toBe('Series1');
    });

    it('should read a title linked to a cell from its cache, and hide the title of a deleted axis', () => {
      const xml = chartSpace(`<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${
        ser({ idx: 0, name: 'A', cat: QUARTERS, val: numRef([1, 2, 3, 4]) })
      }${axIds(1, 2)}</c:barChart>${catAx({ id: 1, cross: 2, title: 'Quarter', deleted: true })}${valAx({ id: 2, cross: 1 })}`)
        .replace('<c:autoTitleDeleted', `<c:title><c:tx>${strRef(['From a cell'])}</c:tx></c:title><c:autoTitleDeleted`);

      const snapshot = read(xml);

      expect(snapshot.title).toEqual({ text: 'From a cell', visible: true });
      expect(snapshot.axes?.category).toEqual({ title: { text: 'Quarter', visible: false } });
    });
  });

  describe('categories', () => {
    it('should write dates as the date axis\' format writes them', () => {
      const xml = chartSpace(`<c:lineChart><c:grouping val="standard"/>${
        ser({ idx: 0, name: 'A', cat: numRef([45292, 45323], 'mmm-yy'), val: numRef([1, 2]) })
      }${axIds(1, 2)}</c:lineChart>${dateAx({ id: 1, cross: 2 })}${valAx({ id: 2, cross: 1 })}`);

      expect(read(xml).series[0].categories).toEqual(['Jan-24', 'Feb-24']);
    });

    it('should write dates on a date axis whose cache has no format, ISO style, and an axis\' own format over the cache\'s', () => {
      const general = chartSpace(`<c:lineChart><c:grouping val="standard"/>${
        ser({ idx: 0, name: 'A', cat: numRef([45292]), val: numRef([1]) })
      }${axIds(1, 2)}</c:lineChart>${dateAx({ id: 1, cross: 2 })}${valAx({ id: 2, cross: 1 })}`);
      const own = general.replace('<c:axPos val="b"/>', '<c:axPos val="b"/><c:numFmt formatCode="d mmmm yyyy" sourceLinked="0"/>');

      expect(read(general).series[0].categories).toEqual(['2024-01-01']);
      expect(read(own).series[0].categories).toEqual(['1 January 2024']);
    });

    it('should write numeric categories as General writes them', () => {
      const xml = chartSpace(`<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${
        ser({ idx: 0, name: 'A', cat: numRef([2020, 2021.5]), val: numRef([1, 2]) })
      }${axIds(1, 2)}</c:barChart>${AXES}`);

      expect(read(xml).series[0].categories).toEqual(['2020', '2021.5']);
    });

    it('should read a multi-level category\'s levels, outer first, a blank outer label carried down', () => {
      const xml = chartSpace(`<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${
        ser({ idx: 0, name: 'A', cat: multiLevel([['2024', null, '2025'], ['Q1', 'Q2', 'Q1']]), val: numRef([1, 2, 3]) })
      }${axIds(1, 2)}</c:barChart>${AXES}`);

      const snapshot = read(xml);

      expect(snapshot.series[0].categories).toEqual(['2024 Q1', '2024 Q2', '2025 Q1']);
      expect(snapshot.categoryLevels).toEqual([['2024', 'Q1'], ['2024', 'Q2'], ['2025', 'Q1']]);
    });

    it('should pad the shorter of the categories and the values, so a gap at the end is kept', () => {
      const xml = chartSpace(`<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${
        ser({ idx: 0, name: 'A', cat: QUARTERS, val: numRef([1, 2, null, null]) })
      }${axIds(1, 2)}</c:barChart>${AXES}`);

      expect(read(xml).series[0].values).toEqual(['1', '2', '', '']);
    });
  });

  it('should say how blanks are plotted, as Excel.ChartDisplayBlanksAs says it', () => {
    const line = `<c:lineChart><c:grouping val="standard"/>${ser({ idx: 0, name: 'A', cat: QUARTERS, val: numRef([1, null, 3, 4]) })}${axIds(1, 2)}</c:lineChart>${AXES}`;

    expect(read(chartSpace(line, { blanks: 'zero' })).displayBlanksAs).toBe('Zero');
    expect(read(chartSpace(line, { blanks: 'span' })).displayBlanksAs).toBe('Interplotted');
    expect(read(chartSpace(line)).displayBlanksAs).toBe('NotPlotted');
  });

  it('should not read a part that is not a chart', () => {
    const document = parseXml('<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');

    expect(document === null ? undefined : readChartPart(document.documentElement)).toBeNull();
    expect(parseXml('<not closed')).toBeNull();
  });
});
