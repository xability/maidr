import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, test } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { Heatmap } from '@model/heatmap';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/**
 * `getAllOriginalElements` is what the high-contrast service asks for the
 * chart's data marks, so it can tell data from furniture.
 *
 * A trace whose highlight values are hidden clones reaches the mark through
 * `previousElementSibling`, because the clone is inserted straight after it.
 * A trace that highlights the chart's live geometry in place -- a heatmap
 * cell, a box part, a bar addressed by a list of selectors -- holds the mark
 * itself, and its previous sibling is the *neighbouring* mark. Read the same
 * way, the list comes back shifted by one: the last mark is missing and
 * whatever same-tag element precedes the first mark is styled as data.
 */

function installDom(html: string): void {
  const dom = new JSDOM(html);
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = dom.window.document;
  g.SVGElement = dom.window.SVGElement;
  g.SVGRectElement = dom.window.SVGRectElement ?? dom.window.SVGElement;
  g.SVGPathElement = dom.window.SVGPathElement ?? class SVGPathElementStub {};
  g.SVGImageElement = dom.window.SVGImageElement ?? class SVGImageElementStub {};
}

function uninstallDom(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.document;
  delete g.SVGElement;
  delete g.SVGRectElement;
  delete g.SVGPathElement;
  delete g.SVGImageElement;
}

/** A background rect the chart drew before its cells, then a 1x3 grid. */
const HEATMAP_SVG = '<!doctype html><svg xmlns="http://www.w3.org/2000/svg">'
  + '<rect id="background"/>'
  + '<rect id="c0" class="cell"/><rect id="c1" class="cell"/><rect id="c2" class="cell"/>'
  + '</svg>';

function heatmapLayer(): MaidrLayer {
  return {
    id: 'hm',
    type: TraceType.HEATMAP,
    title: 'test',
    axes: { x: { label: 'X' }, y: { label: 'Y' }, z: { label: 'Z' } },
    selectors: '.cell',
    data: {
      x: ['a', 'b', 'c'],
      y: ['row'],
      points: [[1, 2, 3]],
    } satisfies HeatmapData,
  };
}

/** Three bars, each addressed by its own selector. */
const BAR_SVG = '<!doctype html><svg xmlns="http://www.w3.org/2000/svg">'
  + '<rect id="frame"/>'
  + '<rect id="b0"/><rect id="b1"/><rect id="b2"/>'
  + '</svg>';

function barLayer(selectors: string | string[]): MaidrLayer {
  return {
    id: 'bars',
    type: TraceType.BAR,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    selectors,
    data: [{ x: 'a', y: 1 }, { x: 'b', y: 2 }, { x: 'c', y: 3 }],
  };
}

function idsOf(elements: SVGElement[]): string[] {
  return elements.map(element => element.id);
}

describe('getAllOriginalElements', () => {
  afterEach(uninstallDom);

  test('returns the live cells of a heatmap, not their neighbours', () => {
    installDom(HEATMAP_SVG);
    const trace = new Heatmap(heatmapLayer());

    const originals = trace.getAllOriginalElements();

    // Every cell, and only the cells. Shifted by one this would read
    // background, c0, c1: the last cell dropped and the background styled
    // as though it were data.
    expect(idsOf(originals)).toEqual(['c0', 'c1', 'c2']);
  });

  test('still resolves a hidden clone back to the mark it stands beside', () => {
    installDom(BAR_SVG);
    const trace = new BarTrace(barLayer('#b0, #b1, #b2'));

    const originals = trace.getAllOriginalElements();

    expect(idsOf(originals)).toEqual(['b0', 'b1', 'b2']);
  });

  test('resolves a list of per-bar selectors to the bars themselves', () => {
    installDom(BAR_SVG);
    const trace = new BarTrace(barLayer(['#b0', '#b1', '#b2']));

    const originals = trace.getAllOriginalElements();

    expect(idsOf(originals)).toEqual(['b0', 'b1', 'b2']);
  });
});
