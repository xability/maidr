/**
 * @jest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DecompressionStream, ReadableStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { convertExcelChart } from '../../../src/adapters/excel/converter';
import { readDocumentCharts, readPresentationCharts } from '../../../src/adapters/office/package';
import { bytesSource, openZip } from '../../../src/adapters/office/zip';
import { CHART_TYPE, CHARTEX_TYPE, columnChart, DOCUMENT_TYPE, drawing, flatPackage, frame, NS, rels, slide, SLIDE_TYPE, WATERFALL } from './officeFiles';
import { zipFiles } from './zipFixture';

// jsdom has none of these; a browser and Node have all of them.
beforeAll(() => {
  Object.assign(globalThis, {
    DecompressionStream: globalThis.DecompressionStream ?? DecompressionStream,
    ReadableStream: globalThis.ReadableStream ?? ReadableStream,
    TextDecoder: globalThis.TextDecoder ?? TextDecoder,
    TextEncoder: globalThis.TextEncoder ?? TextEncoder,
  });
});

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
afterAll(() => warn.mockRestore());

describe('readPresentationCharts', () => {
  it('should read every chart of a deck python-pptx wrote, slide by slide', async () => {
    const bytes = readFileSync(path.join(__dirname, 'fixtures', 'deck.pptx'));
    const zip = await openZip(bytesSource(new Uint8Array(bytes)));

    const charts = await readPresentationCharts(zip);

    expect(charts.map(chart => [chart.position, chart.name, chart.snapshot?.chartType, chart.snapshot?.title?.text])).toEqual([
      [1, 'Chart 2', 'ColumnClustered', 'Sales by quarter'],
      [2, 'Chart 2', 'LineMarkers', 'Visitors'],
      [3, 'Chart 2', 'Pie', 'Share'],
      [4, 'Chart 2', 'BarStacked100', 'Mix'],
      [5, 'Chart 2', 'AreaStacked', 'Stacked area'],
      [6, 'Chart 2', 'RadarMarkers', 'Skills'],
      [7, 'Chart 2', 'Doughnut', 'Rings'],
      [8, 'Chart 2', 'XYScatter', 'Points'],
      [9, 'Chart 2', 'Bubble', 'Cities'],
    ]);
    expect(charts[0]).toMatchObject({ id: '256:3', slideId: '256', shapeId: '3' });
    expect(charts[0].snapshot?.series.map(one => [one.name, one.values])).toEqual([
      ['North', ['120', '135', '150', '170']],
      ['South', ['80', '95', '110', '105']],
    ]);
    for (const chart of charts) {
      expect(convertExcelChart(chart.snapshot)).not.toBeNull();
    }
  });

  it('should follow the slide show\'s order, and read a chart of a 2016 type, a grouped chart and a hidden slide\'s', async () => {
    const zip = await openZip(bytesSource(await zipFiles({
      '_rels/.rels': rels(['rId1', DOCUMENT_TYPE, 'ppt/presentation.xml']),
      'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation xmlns:p="${NS.p}" xmlns:r="${NS.r}">`
        + `<p:sldIdLst><p:sldId id="300" r:id="rId3"/><p:sldId id="301" r:id="rId2"/><p:sldId id="302" r:id="rId4"/></p:sldIdLst></p:presentation>`,
      'ppt/_rels/presentation.xml.rels': rels(
        ['rId2', SLIDE_TYPE, 'slides/slide1.xml'],
        ['rId3', SLIDE_TYPE, 'slides/slide2.xml'],
        ['rId4', SLIDE_TYPE, '/ppt/slides/slide3.xml'],
      ),
      // First in the show: a chartEx frame offered in mc:Choice, with a
      // picture for older PowerPoint in mc:Fallback.
      'ppt/slides/slide2.xml': slide(`<mc:AlternateContent><mc:Choice Requires="cx1">${frame(4, 'Chart 3', 'rId1', { ex: true, descr: 'Cash flow by month' })}</mc:Choice>`
        + `<mc:Fallback><p:sp><p:nvSpPr><p:cNvPr id="4" name="Chart 3"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp></mc:Fallback></mc:AlternateContent>`),
      'ppt/slides/_rels/slide2.xml.rels': rels(['rId1', CHARTEX_TYPE, '../charts/chartEx1.xml']),
      // Second: two charts, one inside a group, and one whose part is gone.
      'ppt/slides/slide1.xml': slide(`<p:grpSp><p:nvGrpSpPr><p:cNvPr id="7" name="Group 6"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${frame(5, 'Chart 4', 'rId1')}</p:grpSp>${frame(6, 'Chart 5', 'rId2')}`),
      'ppt/slides/_rels/slide1.xml.rels': rels(['rId1', CHART_TYPE, '../charts/chart1.xml'], ['rId2', CHART_TYPE, '../charts/missing.xml'], ['rId3', CHART_TYPE, 'https://example.com/chart.xml', true]),
      // Third: hidden from the show.
      'ppt/slides/slide3.xml': slide(frame(2, 'Chart 1', 'rId1'), true),
      'ppt/slides/_rels/slide3.xml.rels': rels(['rId1', CHART_TYPE, '../charts/chart2.xml']),
      'ppt/charts/chart1.xml': columnChart('Grouped'),
      'ppt/charts/chart2.xml': columnChart('Hidden'),
      'ppt/charts/chartEx1.xml': WATERFALL,
    })));

    const charts = await readPresentationCharts(zip);

    expect(charts.map(chart => [chart.id, chart.position, chart.name, chart.hidden ?? false, chart.snapshot?.chartType ?? null])).toEqual([
      ['300:4', 1, 'Chart 3', false, 'Waterfall'],
      ['301:5', 2, 'Chart 4', false, 'ColumnClustered'],
      ['301:6', 2, 'Chart 5', false, null],
      ['302:2', 3, 'Chart 1', true, 'ColumnClustered'],
    ]);
    expect(charts[0].description).toBe('Cash flow by month');
  });

  it('should read a presentation with no slides as having no charts', async () => {
    const zip = await openZip(bytesSource(await zipFiles({
      'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation xmlns:p="${NS.p}"/>`,
    })));

    expect(await readPresentationCharts(zip)).toEqual([]);
  });
});

describe('readDocumentCharts', () => {
  it('should read a document\'s charts in reading order, one in a text box once, though Word offers it twice', async () => {
    const body = `<w:document xmlns:w="${NS.w}" xmlns:wp="${NS.wp}" xmlns:r="${NS.r}" xmlns:mc="${NS.mc}" xmlns:wps="${NS.wps}"><w:body>`
      + `<w:p>${drawing(1, 'Chart 1', 'rId5', { descr: 'Sales by quarter' })}</w:p>`
      // A text box holding a chart: in mc:Choice, and again in mc:Fallback for older Word.
      + `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor><wp:docPr id="2" name="Text Box 2"/><a:graphic xmlns:a="${NS.a}">`
      + `<a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:txbx><w:txbxContent><w:p>${drawing(3, 'Chart 3', 'rId6', { ex: true })}</w:p></w:txbxContent></wps:txbx></wps:wsp></a:graphicData>`
      + `</a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:p>${drawing(3, 'Chart 3', 'rId6', { ex: true })}</w:p></mc:Fallback></mc:AlternateContent></w:r></w:p>`
      + `<w:p>${drawing(4, 'Chart 4', 'rId9')}</w:p>`
      + `</w:body></w:document>`;
    const text = flatPackage({
      '/_rels/.rels': rels(['rId1', DOCUMENT_TYPE, 'word/document.xml']),
      '/word/document.xml': body,
      '/word/_rels/document.xml.rels': rels(['rId5', CHART_TYPE, 'charts/chart1.xml'], ['rId6', CHARTEX_TYPE, 'charts/chartEx1.xml']),
      '/word/charts/chart1.xml': columnChart('Sales'),
      '/word/charts/chartEx1.xml': WATERFALL,
    });

    const charts = await readDocumentCharts(text);

    expect(charts.map(chart => [chart.id, chart.position, chart.name, chart.description, chart.snapshot?.chartType ?? null])).toEqual([
      ['1', 1, 'Chart 1', 'Sales by quarter', 'ColumnClustered'],
      ['3', 2, 'Chart 3', undefined, 'Waterfall'],
      ['4', 3, 'Chart 4', undefined, null],
    ]);
  });

  it('should read text that is not a flat package as having no charts', async () => {
    expect(await readDocumentCharts('<w:document xmlns:w="urn:x"/>')).toEqual([]);
    expect(await readDocumentCharts('not xml')).toEqual([]);
  });
});
