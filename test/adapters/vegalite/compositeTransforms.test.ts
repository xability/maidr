/**
 * The transforms of a concat, a facet or a repeat, and of a layered child of
 * one, reach the layers drawn under them.
 *
 * A layer's chart type is read partly off the transforms that made its rows:
 * a `window` ranking the rows is what makes a line a bump chart. A layer of
 * a layered spec was read with its parent's transforms, but a layer of a
 * composite child was read with its own alone, so a window written on a
 * concat, a facet or a repeat, or on a layered child of one, was not seen and
 * the bump chart under it was read as a plain line: no "Ranks shown", no
 * places lost or gained, and no first place.
 */
import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { Maidr, MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { afterAll, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

const SCORES = [
  { league: 'East', team: 'Ash', round: 'R1', score: 10 },
  { league: 'East', team: 'Ash', round: 'R2', score: 5 },
  { league: 'East', team: 'Birch', round: 'R1', score: 8 },
  { league: 'East', team: 'Birch', round: 'R2', score: 9 },
  { league: 'West', team: 'Dune', round: 'R1', score: 4 },
  { league: 'West', team: 'Dune', round: 'R2', score: 7 },
  { league: 'West', team: 'Elm', round: 'R1', score: 6 },
  { league: 'West', team: 'Elm', round: 'R2', score: 2 },
];
const RANK = [{ window: [{ op: 'rank', as: 'rank' }], groupby: ['league', 'round'], sort: [{ field: 'score', order: 'descending' }] }];
const ROUND = { field: 'round', type: 'ordinal' };
const BUMP = { mark: 'line', encoding: { x: ROUND, y: { field: 'rank', type: 'ordinal' }, color: { field: 'team', type: 'nominal' } } };
const LABELS = { mark: 'text', encoding: { x: ROUND, y: { field: 'rank', type: 'ordinal' }, text: { field: 'team' } } };
const BARS = { mark: 'bar', encoding: { x: { field: 'team', type: 'nominal' }, y: { field: 'score', type: 'quantitative' } } };
const REPEATED = { mark: 'point', encoding: { x: ROUND, y: { field: { repeat: 'column' }, type: 'quantitative' } } };

/**
 * Every layer of a chart, panel by panel.
 * @param maidr - The converted chart
 * @returns Its layers
 */
function layersOf(maidr: Maidr): MaidrLayer[] {
  return maidr.subplots.flat().flatMap(subplot => subplot.layers);
}

/**
 * The type of each layer a spec is read as.
 * @param spec - The spec
 * @returns Each layer's type, panel by panel
 */
function typesOf(spec: unknown): TraceType[] {
  return layersOf(vegaLiteToMaidr(spec as VegaLiteSpec)).map(layer => layer.type);
}

describe('vega-lite transforms above a composite child', () => {
  it.each([
    ['a layered concat child that ranks its rows', { data: { values: SCORES }, hconcat: [{ transform: RANK, layer: [BUMP, LABELS] }, BARS] }],
    ['a concat child under a concat that ranks the rows', { data: { values: SCORES }, transform: RANK, hconcat: [BUMP, BARS] }],
    ['a layered concat child under a concat that ranks the rows', { data: { values: SCORES }, transform: RANK, hconcat: [{ layer: [BUMP, LABELS] }, BARS] }],
    ['a child of a nested concat, under the outer concat that ranks the rows', { data: { values: SCORES }, transform: RANK, hconcat: [{ vconcat: [BUMP] }, BARS] }],
  ])('reads a ranked line as a bump chart in %s', (_, spec) => {
    // Before: a line, its window unseen.
    expect(typesOf(spec)[0]).toBe(TraceType.BUMP);
  });

  it.each([
    ['under a facet that ranks the rows', { data: { values: SCORES }, transform: RANK, facet: { column: { field: 'league' } }, spec: BUMP }],
    ['in a layered facet child that ranks its rows', { data: { values: SCORES }, facet: { column: { field: 'league' } }, spec: { transform: RANK, layer: [BUMP, LABELS] } }],
  ])('reads a ranked line as a bump chart in every panel %s', (_, spec) => {
    const types = typesOf(spec);

    expect(types).toHaveLength(2);
    expect(types.every(type => type === TraceType.BUMP)).toBe(true);
  });

  it.each([
    ['in a layered repeat child that ranks its rows', { data: { values: SCORES }, repeat: { column: ['score'] }, spec: { transform: RANK, layer: [BUMP, REPEATED] } }],
    ['under a repeat that ranks the rows', { data: { values: SCORES }, transform: RANK, repeat: { column: ['score'] }, spec: { layer: [BUMP, REPEATED] } }],
  ])('reads a ranked line as a bump chart %s', (_, spec) => {
    expect(typesOf(spec)[0]).toBe(TraceType.BUMP);
  });

  it('keeps a line that plots the score a line, under a concat that ranks the rows', () => {
    // The window ranks the rows for something else; the line draws the
    // scores, which is an ordinary line.
    const line = { mark: 'line', encoding: { x: ROUND, y: { field: 'score', type: 'quantitative' }, color: { field: 'team', type: 'nominal' } } };

    expect(typesOf({ data: { values: SCORES }, transform: RANK, hconcat: [line, BARS] })[0]).toBe(TraceType.LINE);
  });

  it('reads the window of a faceted spec written with the encoding shorthand once', () => {
    // The shorthand's child is the spec itself, so its window is its own.
    const spec = { data: { values: SCORES }, transform: RANK, ...BUMP, encoding: { ...BUMP.encoding, column: { field: 'league' } } };

    expect(typesOf(spec)).toEqual([TraceType.BUMP, TraceType.BUMP]);
  });
});
