import type { GoogleChart, GoogleDataTable } from '@adapters/google-charts/types';
import type { TreemapPoint } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { describe, expect, it, jest } from '@jest/globals';
import { TreemapTrace } from '@model/treemap';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/**
 * An org chart is a tree, and this one was a network (#1166).
 *
 * #1158 settled it for Highcharts' `organization` series, which declares its
 * hierarchy exactly as Google's `OrgChart` does — `[node id, parent id]`. The
 * Google reading built links from the same rows and handed them to
 * `NetworkTrace`, which is correct about every pointer and silent about which
 * way up the chart is.
 *
 * Measured before the change, on the five-person chart below, the position on
 * Jim — who reports to Mike and manages Bob and Carol:
 *
 *     text  main  {"label":"Name","value":"Jim"}
 *           cross {"label":"Links","value":3}
 *           aside {"label":"Links","value":"3, to Mike, Bob, Carol"}
 *     audio freq  {"raw":3}   panning {"rows":1,"cols":5}
 *
 * One manager and two reports in a single undifferentiated list. The number
 * was wrong for the same reason — a leaf's degree counts its **parent**, so
 * Bob announced `Links: 1` with nobody reporting to him — the pitch followed
 * that degree, and the layout was one flat row of five ordered by
 * connectedness.
 */

/** One org chart row: the node's id, its manager's id, and a tooltip. */
type OrgRow = [string, string | null, string];

const ROWS: OrgRow[] = [
  ['Mike', null, 'The President'],
  ['Jim', 'Mike', 'VP'],
  ['Alice', 'Mike', 'VP'],
  ['Bob', 'Jim', 'Engineer'],
  ['Carol', 'Jim', 'Engineer'],
];

const LABELS = ['Name', 'Manager', 'Tooltip'];

/**
 * Minimal DataTable fake for an OrgChart. The formatted value carries the
 * markup an org chart routinely puts in the cell it draws.
 */
function makeOrgDataTable(rows: OrgRow[] = ROWS): GoogleDataTable {
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => LABELS.length,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) =>
      (c === 0 ? `${rows[r][0]}<div>${rows[r][2]}</div>` : String(rows[r][c] ?? '')),
    getColumnLabel: c => LABELS[c],
    getColumnType: () => 'string',
  };
}

/** An OrgChart exposes no layout interface — this fake fails loudly if asked. */
const ORG_CHART: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
  getChartLayoutInterface: () => {
    throw new Error('the org chart reading must not need a layout interface');
  },
};

/** An OrgChart renders an HTML table rather than SVG. */
function makeOrgContainer(): HTMLElement {
  const dom = new JSDOM(
    '<!doctype html><body><div id="org-chart"><table><tbody></tbody></table></div></body>',
  );
  return dom.window.document.getElementById('org-chart') as HTMLElement;
}

function build(dt: GoogleDataTable = makeOrgDataTable()): ReturnType<
  typeof createMaidrFromGoogleChart
>['subplots'][0][0]['layers'][0] {
  const maidr = createMaidrFromGoogleChart(ORG_CHART, dt, makeOrgContainer(), {
    chartType: 'OrgChart',
  });
  return maidr.subplots[0][0].layers[0];
}

describe('createMaidrFromGoogleChart with an OrgChart', () => {
  it('reads the manager pointers as a hierarchy, top first', () => {
    const layer = build();

    expect(layer.type).toBe(TraceType.TREE);
    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'Mike', path: [] },
      { x: 'Jim', path: ['Mike'] },
      { x: 'Alice', path: ['Mike'] },
      { x: 'Bob', path: ['Mike', 'Jim'] },
      { x: 'Carol', path: ['Mike', 'Jim'] },
    ]);
  });

  it('counts reports rather than links', () => {
    // The half a graph could not say. Mike manages two people; Bob manages
    // nobody and says nothing about it, where the degree reading announced
    // his manager as a link of his own.
    const layer = build();
    const trace = new TreemapTrace(layer);

    const asidesOf = (): { label: string; value: string }[] => {
      const state = trace.state as {
        text?: { asides?: { label: string; value: string }[] };
      };
      return state.text?.asides ?? [];
    };

    expect(asidesOf()).toContainEqual({ label: 'Children', value: '2' });
    expect(asidesOf().map(a => a.label)).not.toContain('Links');
  });

  it('identifies a node by its raw id rather than by what the chart draws', () => {
    const layer = build();

    // An org chart puts markup in the formatted value; matching a manager
    // pointer against that would leave every node a root, and naming a node
    // by it would announce the markup.
    const data = layer.data as TreemapPoint[];
    expect(data.every(node => !String(node.x).includes('<div>'))).toBe(true);
    expect(data.every(node =>
      (node.path ?? []).every(step => !String(step).includes('<div>')),
    )).toBe(true);
  });

  it('announces no magnitude, because the table carries none', () => {
    const layer = build();

    // No third column of numbers, and nothing on the page is sized. #1153
    // gave `TreemapTrace` a tree with nothing on a second axis; naming one
    // here would claim an axis the chart does not draw.
    expect(layer.axes).toEqual({ x: { label: 'Name' } });
    expect((layer.data as TreemapPoint[]).every(node => node.y === undefined)).toBe(true);
  });

  it('ships without selectors', () => {
    const layer = build();

    // An OrgChart renders an HTML <table> and draws no element per node — the
    // connectors are cell borders — so there is nothing to point at.
    expect(layer.selectors).toBeUndefined();
  });

  it('stops a path at a manager who is not on the chart', () => {
    // Google draws a node whose manager names no row as a root of its own.
    const layer = build(makeOrgDataTable([
      ['Mike', null, 'The President'],
      ['Jim', 'Nobody', 'VP'],
      ['Bob', 'Jim', 'Engineer'],
    ]));

    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'Mike', path: [] },
      { x: 'Jim', path: [] },
      { x: 'Bob', path: ['Jim'] },
    ]);
  });

  it('breaks a cyclic manager chain rather than following it', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const layer = build(makeOrgDataTable([
      ['Ann', 'Bea', 'x'],
      ['Bea', 'Ann', 'y'],
    ]));

    // Each stops one step up rather than looping, and says so once.
    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'Ann', path: ['Bea'] },
      { x: 'Bea', path: ['Ann'] },
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cyclic manager chain'));

    warn.mockRestore();
  });

  it('stops a row that names itself as its own manager', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const layer = build(makeOrgDataTable([['Solo', 'Solo', 'x']]));

    expect(layer.data as TreemapPoint[]).toEqual([{ x: 'Solo', path: [] }]);

    warn.mockRestore();
  });
});
