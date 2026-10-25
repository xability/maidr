import type { Maidr } from '@type/grammar';
import { afterAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { chartWithText, producerText, resetProducerTextWarnings } from '@util/producerText';

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warn.mockClear();
  resetProducerTextWarnings();
});

afterAll(() => {
  warn.mockRestore();
});

/**
 * A one-layer chart. `title` is `unknown` on purpose: these are values that
 * arrive from parsed JSON where the grammar says a string goes.
 *
 * @param layerTitle - The layer's `title`, as written
 * @returns The chart
 */
function chartWithLayerTitle(layerTitle: unknown): Maidr {
  return {
    id: 'chart',
    title: 'Petal Length by Species',
    subplots: [[{
      layers: [{
        id: '1',
        type: TraceType.BAR,
        title: layerTitle as string,
        axes: { x: { label: 'Species' }, y: { label: 'Petal Length (cm)' } },
        data: [{ x: 'setosa', y: 1.5 }],
      }],
    }]],
  };
}

describe('producerText', () => {
  test('keeps a string, and reads a number or a boolean as the string it prints as', () => {
    expect(producerText('Sales', 'title')).toBe('Sales');
    expect(producerText('', 'title')).toBe('');
    expect(producerText(2024, 'title')).toBe('2024');
    expect(producerText(true, 'title')).toBe('true');
  });

  test('reads a missing value as absent without a warning', () => {
    expect(producerText(undefined, 'title')).toBeUndefined();
    expect(producerText(null, 'title')).toBeUndefined();

    expect(warn).not.toHaveBeenCalled();
  });

  test('reads an object or a list as absent, and says so once', () => {
    expect(producerText({}, 'Layer "1" (box) "title"')).toBeUndefined();
    expect(producerText({}, 'Layer "1" (box) "title"')).toBeUndefined();
    expect(producerText([], 'Layer "1" (box) "title"')).toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toContain('Layer "1" (box) "title" is {}, not text');
  });
});

describe('chartWithText', () => {
  test('returns a chart whose text is all text as it is', () => {
    const chart = chartWithLayerTitle('Petal length');

    expect(chartWithText(chart)).toBe(chart);
  });

  test('leaves out a layer title written as an empty object', () => {
    const read = chartWithText(chartWithLayerTitle({}));
    const layer = read.subplots[0][0].layers[0];

    expect('title' in layer).toBe(false);
    expect(layer.axes?.x?.label).toBe('Species');
    expect(read.title).toBe('Petal Length by Species');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('reads the chart\'s own text and every axis label the same way', () => {
    const chart = {
      ...chartWithLayerTitle('Petal length'),
      subtitle: {},
      caption: 7,
      axes: { x: { label: [] } },
    } as unknown as Maidr;
    chart.subplots[0][0].layers[0].axes = { x: { label: {} as string }, y: { label: 'Count' } };
    chart.subplots[0][0].layers[0].name = 3 as unknown as string;

    const read = chartWithText(chart);
    const layer = read.subplots[0][0].layers[0];

    expect('subtitle' in read).toBe(false);
    expect(read.caption).toBe('7');
    expect(read.axes?.x && 'label' in read.axes.x).toBe(false);
    expect(layer.axes?.x && 'label' in layer.axes.x).toBe(false);
    expect(layer.axes?.y?.label).toBe('Count');
    expect(layer.name).toBe('3');
  });

  test('does not change the chart it was given', () => {
    const chart = chartWithLayerTitle({});

    chartWithText(chart);

    expect(chart.subplots[0][0].layers[0].title).toEqual({});
  });
});
