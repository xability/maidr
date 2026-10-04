/**
 * @jest-environment jsdom
 */

import { DecompressionStream, ReadableStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { readPowerPointCharts, readWordCharts, selectedPowerPointChart, selectedWordChart } from '../../../src/adapters/office/reader';
import { ZipError } from '../../../src/adapters/office/zip';
import { FakeOffice, FakePowerPoint, FakeWord } from './fakeOffice';
import { CHART_TYPE, columnChart, deck, DOCUMENT_TYPE, frame, NS, rels, slide, SLIDE_TYPE, wordDocument } from './officeFiles';
import { zipFiles } from './zipFixture';

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

describe('readPowerPointCharts', () => {
  it('should fetch only the slices the slides and charts are in, not a video\'s', async () => {
    // A presentation of 64 KB slices on iPad: a 4 MB video between the parts
    // read and the directory at the end.
    const video = new Uint8Array(4 * 1024 * 1024).map((_, i) => (i * 7919) % 251);
    const bytes = await zipFiles({
      '_rels/.rels': rels(['rId1', DOCUMENT_TYPE, 'ppt/presentation.xml']),
      'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation xmlns:p="${NS.p}" xmlns:r="${NS.r}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
      'ppt/_rels/presentation.xml.rels': rels(['rId1', SLIDE_TYPE, 'slides/slide1.xml']),
      'ppt/slides/slide1.xml': slide(frame(4, 'Chart 3', 'rId2')),
      'ppt/slides/_rels/slide1.xml.rels': rels(['rId2', CHART_TYPE, '../charts/chart1.xml']),
      'ppt/charts/chart1.xml': columnChart('Sales'),
      'ppt/media/media1.mp4': video,
    }, { deflate: false });
    const office = new FakeOffice({ platform: 'iOS', file: () => bytes });

    const charts = await readPowerPointCharts(office);

    expect(charts.map(chart => chart.snapshot?.chartType)).toEqual(['ColumnClustered']);
    const sliceCount = Math.ceil(bytes.length / (64 * 1024));
    expect(office.slicesFetched.length).toBeLessThan(5);
    expect(sliceCount).toBeGreaterThan(64);
    expect(office.open).toBe(false);
  });

  it('should close the file when it is not a presentation', async () => {
    const office = new FakeOffice({ file: () => new TextEncoder().encode('not a zip file at all, just text that runs on') });

    await expect(readPowerPointCharts(office)).rejects.toBeInstanceOf(ZipError);
    expect(office.open).toBe(false);
  });

  it('should read one at a time, as Office.js keeps one file open', async () => {
    const bytes = await deck([{ name: 'Chart 3', part: columnChart('Sales') }]);
    const office = new FakeOffice({ file: () => bytes });

    const both = await Promise.all([readPowerPointCharts(office), readPowerPointCharts(office)]);

    expect(both.map(charts => charts.length)).toEqual([1, 1]);
    expect(office.fileReads).toBe(2);
  });

  it('should say why when PowerPoint cannot hand the file over', async () => {
    await expect(readPowerPointCharts(new FakeOffice({ fileFails: true }))).rejects.toThrow('Document.getFileAsync failed: The operation failed.');
    await expect(readPowerPointCharts(new FakeOffice())).rejects.toThrow('no Document.getFileAsync');
  });
});

describe('selectedPowerPointChart', () => {
  const charts = [
    { id: '256:4', position: 1, name: 'Chart 3', slideId: '256', shapeId: '4', snapshot: null },
    { id: '257:4', position: 2, name: 'Chart 3', slideId: '257', shapeId: '4', snapshot: null },
    { id: '257:7', position: 2, name: 'Sales chart', slideId: '257', shapeId: '7', snapshot: null },
  ];

  it('should find the selected chart by its slide\'s position and its id, whatever the slide id looks like', async () => {
    const powerpoint = new FakePowerPoint(['256#1', '257#2']);
    powerpoint.selectedSlide = powerpoint.slides[1];

    powerpoint.selectedShapes = [{ id: '4', name: 'Chart 3', type: 'Chart' }];
    expect(await selectedPowerPointChart(powerpoint, charts)).toBe('257:4');
    powerpoint.selectedShapes = [{ id: '#7', name: 'renamed', type: 'Chart' }];
    expect(await selectedPowerPointChart(powerpoint, charts)).toBe('257:7');
    powerpoint.selectedShapes = [{ id: '{other}', name: 'Sales chart', type: 'Chart' }];
    expect(await selectedPowerPointChart(powerpoint, charts)).toBe('257:7');
  });

  it('should answer null for no chart, and undefined for a chart the reading does not have', async () => {
    const powerpoint = new FakePowerPoint(['256#', '257#']);

    expect(await selectedPowerPointChart(powerpoint, charts)).toBeNull();
    powerpoint.selectedSlide = powerpoint.slides[0];
    powerpoint.selectedShapes = [{ id: '2', name: 'Title 1', type: 'Placeholder' }];
    expect(await selectedPowerPointChart(powerpoint, charts)).toBeNull();
    powerpoint.selectedShapes = [{ id: '9', name: 'Chart 8', type: 'Chart' }];
    expect(await selectedPowerPointChart(powerpoint, charts)).toBeUndefined();
    powerpoint.selectedShapes = [{ id: '4', name: 'Chart 3' }, { id: '5', name: 'Chart 5' }];
    expect(await selectedPowerPointChart(powerpoint, charts)).toBeNull();
  });
});

describe('Word', () => {
  it('should read the body\'s charts, and the chart in the selection', async () => {
    const word = new FakeWord(
      wordDocument([{ id: 1, name: 'Chart 1', part: columnChart('Sales') }]),
      wordDocument([{ id: 1, name: 'Chart 1', part: columnChart('Sales', [5, 6]) }]),
    );

    const charts = await readWordCharts(word);
    const selected = await selectedWordChart(word);

    expect(charts.map(chart => chart.id)).toEqual(['1']);
    expect(selected?.snapshot?.series[0].values).toEqual(['5', '6']);
    word.selection = '';
    expect(await selectedWordChart(word)).toBeNull();
  });
});
