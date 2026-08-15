/**
 * What these tests protect.
 *
 * A layer's selector is how MAIDR finds the element to highlight for the point
 * it is announcing. The two are paired by position: the nth match in document
 * order is the nth datum. So a selector that matches the right elements in the
 * wrong order, or that matches one element too many, highlights a mark that
 * has nothing to do with what was just read out — and every announcement stays
 * correct, so nothing looks broken.
 *
 * These tests resolve each emitted selector against the real rendered chart and
 * check the matches element by element.
 */

import type { BarPoint, LinePoint, SegmentedPoint } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { mountFixture } from './helpers';

describe('selector resolution', () => {
  it('matches one element per data point, in data order', () => {
    const { document, element } = mountFixture('bar');
    const maidr = observablePlotToMaidr(element);
    const layer = maidr?.subplots[0][0].layers[0];
    const data = layer?.data as BarPoint[];

    const matched = document.querySelectorAll(layer?.selectors as string);
    expect(matched).toHaveLength(data.length);
    // Plot draws bars in data order, so the nth rect is the nth datum. Its x
    // attribute is the band the category was drawn at.
    expect(Array.from(matched).map(node => node.getAttribute('x'))).toEqual(['59', '246', '433']);
  });

  it('scopes the selector to its own chart', () => {
    // MAIDR resolves selectors against the whole document, so two charts on
    // one page must not answer for each other. Two copies of the same chart —
    // identical markup, identical geometry — is the case that catches a
    // selector written against the mark group rather than the chart.
    const { document, element } = mountFixture('bar');
    const second = document.querySelector('#host')
      ?.appendChild(element.cloneNode(true) as Element);
    expect(second).toBeTruthy();

    const first = observablePlotToMaidr(element);
    const other = observablePlotToMaidr(second as Element);

    const firstMatches = document.querySelectorAll(first?.subplots[0][0].layers[0].selectors as string);
    const otherMatches = document.querySelectorAll(other?.subplots[0][0].layers[0].selectors as string);

    expect(firstMatches).toHaveLength(3);
    expect(otherMatches).toHaveLength(3);
    expect(element.contains(firstMatches[0])).toBe(true);
    expect(element.contains(otherMatches[0])).toBe(false);
  });

  it('matches every segment of a stacked bar', () => {
    const { document, element } = mountFixture('stacked');
    const maidr = observablePlotToMaidr(element);
    const layer = maidr?.subplots[0][0].layers[0];
    const data = layer?.data as SegmentedPoint[][];

    const expected = data.reduce((total, series) => total + series.length, 0);
    expect(document.querySelectorAll(layer?.selectors as string)).toHaveLength(expected);
  });

  it('gives a multi-series line one selector per series', () => {
    const { document, element } = mountFixture('multiline');
    const maidr = observablePlotToMaidr(element);
    const layer = maidr?.subplots[0][0].layers[0];
    const selectors = layer?.selectors as string[];
    const data = layer?.data as LinePoint[][];

    expect(selectors).toHaveLength(data.length);
    for (const selector of selectors)
      expect(document.querySelectorAll(selector)).toHaveLength(1);
  });

  it('keeps two facets of one mark apart', () => {
    // Both facets are drawn inside the same <g aria-label="bar">, so a
    // selector written against the group rather than the stamped layer would
    // match all four bars for each of the two panels.
    const { document, element } = mountFixture('facet');
    const maidr = observablePlotToMaidr(element);
    const [first, second] = maidr?.subplots[0] ?? [];

    const firstMatches = document.querySelectorAll(first.layers[0].selectors as string);
    const secondMatches = document.querySelectorAll(second.layers[0].selectors as string);

    expect(firstMatches).toHaveLength(2);
    expect(secondMatches).toHaveLength(2);
    expect(Array.from(firstMatches)).not.toEqual(expect.arrayContaining(Array.from(secondMatches)));
  });
});
