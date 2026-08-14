import type { GoogleChart, GoogleDataTable } from '@adapters/google-charts/types';
import type { NetworkPoint } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/** One org chart row: the node's id, its parent's id, and a tooltip. */
type OrgRow = [string, string | null, string];

const ROWS: OrgRow[] = [
  ['Mike', null, 'The President'],
  ['Jim', 'Mike', 'VP'],
  ['Alice', 'Mike', 'VP'],
  ['Bob', 'Jim', 'Engineer'],
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
  it('reads the parent pointers as links, parent first', () => {
    const layer = build();

    expect(layer.type).toBe(TraceType.NETWORK);
    expect(layer.data as NetworkPoint[]).toEqual([
      { source: 'Mike', target: 'Jim' },
      { source: 'Mike', target: 'Alice' },
      { source: 'Jim', target: 'Bob' },
    ]);
  });

  it('identifies a node by its raw id rather than by what the chart draws', () => {
    const layer = build();

    // An org chart puts markup in the formatted value; matching a parent
    // pointer against that would leave every node a root.
    const data = layer.data as NetworkPoint[];
    expect(data.every(link => !String(link.target).includes('<div>'))).toBe(true);
  });

  it('emits no node list', () => {
    const layer = build();

    // `NetworkTrace` derives the nodes and their degrees from the links; a
    // second list would be a second source of truth for them.
    expect(layer.data).toHaveLength(3);
  });

  it('names the node axis and the degree the trace announces', () => {
    const layer = build();

    expect(layer.axes).toEqual({ x: { label: 'Name' }, y: { label: 'Links' } });
  });

  it('ships without selectors', () => {
    const layer = build();

    // An OrgChart renders an HTML <table> and draws no element per link — the
    // connectors are cell borders — so there is nothing to point at.
    expect(layer.selectors).toBeUndefined();
  });
});
