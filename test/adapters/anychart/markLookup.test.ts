/**
 * Which shapes of a rendered AnyChart chart are its marks.
 *
 * The fixtures here are laid out the way AnyChart 8.13 draws, as measured in
 * Chromium, rather than in the flat shape the older fixtures use:
 *
 * - the whole chart sits inside one root `ac_layer_`, and a legend's items
 *   inside the legend's own layer, so layers nest;
 * - the chart's background is a filled `ac_path_` the size of the chart, in an
 *   unclipped layer of its own;
 * - a Cartesian series draws into a layer clipped to the plot area;
 * - a range column, a marimekko tile and a tag cloud's words are filled at
 *   `fill-opacity` 0.85, while the shapes drawn only to catch the pointer are
 *   next to invisible.
 */

import type { AnyChartInstance, AnyChartIterator, AnyChartSeries } from '@adapters/anychart/types';
import { bindAnyChart } from '@adapters/anychart/converters';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  document: dom.window.document,
  window: dom.window,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  Node: dom.window.Node,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
});

const SVG_NS = 'http://www.w3.org/2000/svg';

function element(
  tag: string,
  attributes: Record<string, string>,
  parent: Element,
): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as unknown as SVGElement;
  for (const [name, value] of Object.entries(attributes))
    el.setAttribute(name, value);
  parent.appendChild(el);
  return el;
}

/**
 * A container holding a drawn chart's `<svg>`: the root layer, the chart group
 * inside it, and the background layer every AnyChart chart draws first.
 *
 * @returns The container and the chart group the rest is drawn into
 */
function renderChart(id: string): { container: HTMLElement; chartGroup: SVGElement; background: SVGElement } {
  const container = document.createElement('div');
  container.id = id;
  const svg = document.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);
  document.body.appendChild(container);

  const root = element('g', { id: 'ac_layer_root' }, svg as unknown as Element);
  const chartGroup = element('g', { id: 'ac_chart_1' }, root);
  const backgroundLayer = element('g', { id: 'ac_layer_background' }, chartGroup);
  const background = element('path', {
    id: 'ac_path_background',
    fill: '#ffffff',
    stroke: 'none',
    d: 'M 0 0 L 700 0 700 460 0 460 Z',
  }, backgroundLayer);
  return { container, chartGroup, background };
}

/**
 * A legend: one layer per item inside the legend's own, each holding the item's
 * icon and a near-invisible rectangle that catches the pointer.
 */
function drawLegend(chartGroup: SVGElement, colors: string[]): SVGElement[] {
  const legend = element('g', { 'id': 'ac_layer_legend', 'clip-path': 'url(#ac_clip_legend)' }, chartGroup);
  const items = element('g', { id: 'ac_layer_legend_items' }, legend);
  return colors.map((fill, i) => {
    const item = element('g', { id: `ac_layer_legend_item_${i}` }, items);
    const icon = element('path', { id: `ac_path_icon_${i}`, fill, stroke: 'none', d: 'M 0 0 L 15 0 15 15 0 15 Z' }, item);
    element('path', {
      'id': `ac_rect_hit_${i}`,
      'fill': '#FFFFFF',
      'fill-opacity': '0.00001',
      'd': 'M 0 0 L 98 0 98 15 0 15 Z',
    }, item);
    return icon;
  });
}

function cleanUp(container: HTMLElement): void {
  (container.closest('[data-maidr-anychart-host]') ?? container).remove();
}

function iterate(rows: Array<Record<string, unknown>>): () => AnyChartIterator {
  return () => {
    let index = -1;
    return {
      advance: () => ++index < rows.length,
      get: (field: string) => rows[index]?.[field],
      getIndex: () => index,
      getRowsCount: () => rows.length,
      reset: () => {
        index = -1;
      },
    };
  };
}

/** A chart-level dataset (funnel, tag cloud): no series API at all. */
function createDatasetChart(
  type: string,
  container: HTMLElement,
  rows: Array<Record<string, unknown>>,
): AnyChartInstance {
  return {
    title: () => 'Chart',
    container: () => container,
    getType: () => type,
    data: () => ({ getIterator: iterate(rows) }),
  } as unknown as AnyChartInstance;
}

/** A Cartesian chart carrying the given series. */
function createSeriesChart(
  type: string,
  container: HTMLElement,
  series: Array<{ seriesType: string; name: string; rows: Array<Record<string, unknown>> }>,
): AnyChartInstance {
  const built = series.map(({ seriesType, name, rows }): AnyChartSeries => ({
    id: () => 0,
    name: () => name,
    seriesType: () => seriesType,
    getIterator: iterate(rows),
    getPoint: () => ({ get: () => undefined, getIndex: () => 0, exists: () => false }),
    getStat: () => undefined,
  }));
  return {
    title: () => 'Chart',
    container: () => container,
    getType: () => type,
    getSeriesCount: () => built.length,
    getSeriesAt: (i: number) => built[i] ?? null,
    xScale: () => ({ getType: () => 'ordinal' }),
  } as unknown as AnyChartInstance;
}

function stamps(elements: SVGElement[], attribute: string): Array<string | null> {
  return elements.map(el => el.getAttribute(attribute));
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('a funnel drawn inside AnyChart\'s nested layers', () => {
  const FUNNEL_ATTR = 'data-maidr-anychart-funnel-stage';
  const STAGES = [
    { name: 'Visited the site', value: 24000 },
    { name: 'Viewed a product', value: 9800 },
    { name: 'Added to cart', value: 2400 },
  ];
  const COLORS = ['#64b5f6', '#1976d2', '#ef6c00'];

  function drawFunnel(id: string, segmentCount: number): {
    container: HTMLElement;
    background: SVGElement;
    segments: SVGElement[];
    icons: SVGElement[];
  } {
    const { container, chartGroup, background } = renderChart(id);
    const marks = element('g', { id: 'ac_layer_segments' }, chartGroup);
    const segments = Array.from({ length: segmentCount }, (_, i) =>
      element('path', { id: `ac_path_segment_${i}`, fill: COLORS[i % 3], stroke: 'none', d: 'M 110 37 L 579 37 465 281 224 281 Z' }, marks));
    // The stroke-only twins are drawn into a layer of their own.
    const twins = element('g', { id: 'ac_layer_twins' }, chartGroup);
    for (let i = 0; i < segmentCount; i++)
      element('path', { id: `ac_path_twin_${i}`, fill: 'none', stroke: 'none', d: 'M 110 37 L 579 37 465 281 224 281 Z' }, twins);
    const icons = drawLegend(chartGroup, COLORS);
    return { container, background, segments, icons };
  }

  it('outlines each stage\'s own segment, not the chart background', () => {
    // The root layer holds the background, the three segments and the three
    // legend icons together. Scored with its descendants it won, the
    // background became stage 0, and every stage outlined the one above it.
    const { container, background, segments, icons } = drawFunnel('funnel-nested', 3);

    bindAnyChart(createDatasetChart('funnel', container, STAGES));

    expect(stamps(segments, FUNNEL_ATTR)).toEqual(['0-0', '0-1', '0-2']);
    expect(background.getAttribute(FUNNEL_ATTR)).toBeNull();
    expect(stamps(icons, FUNNEL_ATTR)).toEqual([null, null, null]);

    cleanUp(container);
  });

  it('stamps nothing when the segment layer holds another count', () => {
    // Stamping the first stages anyway is what put each stage's outline on the
    // segment above it: a highlight on the wrong stage is worse than none.
    const { container, segments } = drawFunnel('funnel-short', 2);
    const warn = jest.spyOn(console, 'warn');

    bindAnyChart(createDatasetChart('funnel', container, STAGES));

    expect(stamps(segments, FUNNEL_ATTR)).toEqual([null, null]);
    expect(warn.mock.calls.flat().join(' '))
      .toContain('Expected 3 funnel segments but found 2');

    cleanUp(container);
  });
});

describe('a waterfall drawn inside AnyChart\'s nested layers', () => {
  it('outlines each step\'s own bar', () => {
    // The root layer held the background, five bars and three legend icons —
    // nine filled paths — so the count check withdrew the highlight.
    const { container, chartGroup, background } = renderChart('waterfall-nested');
    const marks = element('g', { 'id': 'ac_layer_bars', 'clip-path': 'url(#ac_clip_plot)' }, chartGroup);
    const bars = ['#96a6a6', '#ef6c00', '#64b5f6'].map((fill, i) =>
      element('path', { id: `ac_path_bar_${i}`, fill, stroke: '#697474', d: 'M 98 141 L 168 141 168 377 98 377 Z' }, marks));
    drawLegend(chartGroup, ['#64b5f6', '#ef6c00', '#96a6a6']);
    const warn = jest.spyOn(console, 'warn');

    bindAnyChart(createSeriesChart('waterfall', container, [{
      seriesType: 'waterfall',
      name: 'Budget',
      rows: [{ x: 'Opening', value: 1200 }, { x: 'Marketing', value: -250 }, { x: 'Sales', value: 480 }],
    }]));

    expect(stamps(bars, 'data-maidr-anychart-waterfall-step')).toEqual(['0-0', '0-1', '0-2']);
    expect(background.getAttribute('data-maidr-anychart-waterfall-step')).toBeNull();
    expect(warn).not.toHaveBeenCalled();

    cleanUp(container);
  });
});

describe('marks AnyChart fills partly transparent', () => {
  it('outlines each range column of a dumbbell chart', () => {
    // AnyChart's theme fills a range column at 0.85. Counted as a hover
    // overlay, every bar was dropped and only the opaque background was left.
    const { container, chartGroup, background } = renderChart('dumbbell-translucent');
    const marks = element('g', { 'id': 'ac_layer_range', 'clip-path': 'url(#ac_clip_plot)' }, chartGroup);
    const bars = [0, 1, 2].map(i =>
      element('path', { 'id': `ac_path_range_${i}`, 'fill': '#64b5f6', 'fill-opacity': '0.85', 'stroke': '#64b5f6', 'd': 'M 92 123 L 162 123 162 94 92 94 Z' }, marks));
    const warn = jest.spyOn(console, 'warn');

    bindAnyChart(createSeriesChart('cartesian', container, [{
      seriesType: 'range-column',
      name: 'Temperature',
      rows: [{ x: 'Mon', low: 4, high: 12 }, { x: 'Tue', low: 6, high: 15 }, { x: 'Wed', low: 5, high: 13 }],
    }]));

    expect(stamps(bars, 'data-maidr-anychart-pair')).toEqual(['0-0', '0-1', '0-2']);
    // The background is filled too, but it is drawn outside the plot area.
    expect(background.getAttribute('data-maidr-anychart-pair')).toBeNull();
    expect(warn).not.toHaveBeenCalled();

    cleanUp(container);
  });

  it('outlines each tile of a marimekko, series by series', () => {
    const { container, chartGroup, background } = renderChart('mosaic-translucent');
    const tiles = ['#64b5f6', '#1976d2'].flatMap((fill, s) => {
      const layer = element('g', { 'id': `ac_layer_series_${s}`, 'clip-path': 'url(#ac_clip_plot)' }, chartGroup);
      return [0, 1, 2].map(c =>
        element('path', { 'id': `ac_path_tile_${s}_${c}`, fill, 'fill-opacity': '0.85', 'stroke': fill, 'd': 'M 90 44 L 231 44 231 260 90 260 Z' }, layer));
    });
    const warn = jest.spyOn(console, 'warn');

    bindAnyChart(createSeriesChart('mosaic', container, [
      { seriesType: 'mekko', name: 'Survived', rows: [{ x: 'First', value: 203 }, { x: 'Second', value: 118 }, { x: 'Third', value: 178 }] },
      { seriesType: 'mekko', name: 'Died', rows: [{ x: 'First', value: 122 }, { x: 'Second', value: 167 }, { x: 'Third', value: 528 }] },
    ]));

    expect(stamps(tiles, 'data-maidr-anychart-tile'))
      .toEqual(['0-0', '0-1', '0-2', '1-0', '1-1', '1-2']);
    expect(background.getAttribute('data-maidr-anychart-tile')).toBeNull();
    expect(warn).not.toHaveBeenCalled();

    cleanUp(container);
  });

  it('still passes over a shape drawn only to catch the pointer', () => {
    // The near-invisible copy is filled like a bar and sits in the plot area,
    // so only its opacity says it is not one.
    const { container, chartGroup } = renderChart('dumbbell-hit-area');
    const marks = element('g', { 'id': 'ac_layer_range', 'clip-path': 'url(#ac_clip_plot)' }, chartGroup);
    const bar = element('path', { 'id': 'ac_path_range_0', 'fill': '#64b5f6', 'fill-opacity': '0.85', 'd': 'M 92 123 L 162 123 162 94 92 94 Z' }, marks);
    const hitArea = element('path', { 'id': 'ac_path_hit', 'fill': '#fff', 'fill-opacity': '0.00001', 'd': 'M 92 123 L 162 123 162 94 92 94 Z' }, marks);

    bindAnyChart(createSeriesChart('cartesian', container, [{
      seriesType: 'range-column',
      name: 'Temperature',
      rows: [{ x: 'Mon', low: 4, high: 12 }],
    }]));

    expect(bar.getAttribute('data-maidr-anychart-pair')).toBe('0-0');
    expect(hitArea.getAttribute('data-maidr-anychart-pair')).toBeNull();

    cleanUp(container);
  });
});

describe('a tag cloud, whose every word AnyChart writes twice', () => {
  it('outlines the visible word, not its invisible copy', () => {
    // AnyChart writes each word first into a layer of near-invisible copies
    // that catch the pointer, then into the layer that is seen. Two elements
    // matched every term, and the whole cloud lost its highlight.
    const { container, chartGroup } = renderChart('cloud-copies');
    const cloud = element('g', { id: 'ac_layer_cloud' }, chartGroup);
    const copies = element('g', { id: 'ac_layer_copies' }, cloud);
    const shown = element('g', { id: 'ac_layer_words' }, cloud);
    const terms = ['accessibility', 'sonification', 'braille'];
    const copyText = terms.map((term, i) => {
      const text = element('text', { id: `ac_simple-text_copy_${i}`, fill: '#fff', opacity: '0.000001' }, copies);
      text.textContent = term;
      return text;
    });
    // Drawn in packing order rather than data order.
    const wordText = ['braille', 'accessibility', 'sonification'].map((term, i) => {
      const text = element('text', { 'id': `ac_simple-text_word_${i}`, 'fill': '#64b5f6', 'fill-opacity': '0.85' }, shown);
      text.textContent = term;
      return text;
    });
    const warn = jest.spyOn(console, 'warn');

    bindAnyChart(createDatasetChart('tag-cloud', container, [
      { x: 'accessibility', value: 164 },
      { x: 'sonification', value: 118 },
      { x: 'braille', value: 96 },
    ]));

    expect(stamps(wordText, 'data-maidr-anychart-word')).toEqual(['0-2', '0-0', '0-1']);
    expect(stamps(copyText, 'data-maidr-anychart-word')).toEqual([null, null, null]);
    expect(warn).not.toHaveBeenCalled();

    cleanUp(container);
  });

  it('outlines a term written with capitals, which AnyChart draws in lower case', () => {
    // Measured on AnyChart 8.13: "Screen Reader", "MAIDR" and "Über" are
    // drawn as "screen reader", "maidr" and "über". Matched exactly, no term
    // with a capital found its word, and the whole cloud lost its highlight.
    const { container, chartGroup } = renderChart('cloud-capitals');
    const shown = element('g', { id: 'ac_layer_words' }, chartGroup);
    const wordText = ['maidr', 'über', 'screen reader'].map((word, i) => {
      const text = element('text', { 'id': `ac_simple-text_word_${i}`, 'fill': '#64b5f6', 'fill-opacity': '0.85' }, shown);
      text.textContent = word;
      return text;
    });
    const warn = jest.spyOn(console, 'warn');

    bindAnyChart(createDatasetChart('tag-cloud', container, [
      { x: 'Screen Reader', value: 80 },
      { x: 'MAIDR', value: 50 },
      { x: 'Über', value: 20 },
    ]));

    expect(stamps(wordText, 'data-maidr-anychart-word')).toEqual(['0-1', '0-2', '0-0']);
    expect(warn).not.toHaveBeenCalled();

    cleanUp(container);
  });
});
