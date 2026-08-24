/**
 * A Highcharts organization chart emitted no layer at all (#1138, #1153).
 *
 * `buildSubplot` sorts series into buckets by type and `organization` was in
 * none of them, so it reached `convertSeries` as an unsupported type and was
 * declined. On a chart that is only the org tree, that is silence.
 *
 * It was declined **deliberately** while the decline lasted, and #1153
 * recorded why. An organization chart is a pure hierarchy: measured on the
 * six-node chart below in Highcharts 11 plus `modules/sankey.js` and
 * `modules/organization.js`, every node came back with no `value` field at
 * all, and Highcharts' own internal `sum` was `1` for every node alike
 * because the layout assigns one unit per link. Both available spellings of
 * that were wrong:
 *
 *   omitting y everywhere      every node announced 0, over a
 *                              freq { min: 0, max: 0 } with no pitch range
 *   declaring the layout's 1   Bo announced as 100% of Ada, and Cy announced
 *                              as 100% of Ada as well
 *
 * `TreemapTrace` now recognises a tree that declares no magnitude anywhere
 * and reads it for what it has, so the payload here declares no `y` and means
 * it.
 *
 * Measured end to end in Chromium against a real chart: six selectors, each
 * matching exactly one `path.highcharts-node` — the drawn box.
 */
import type { HighchartsNode, HighchartsSeries } from '@adapters/highcharts/types';
import type { TreemapPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeSeries } from './helpers';

interface NodeInput {
  id: string;
  name?: string;
  title?: string;
  parents?: string[];
}

/**
 * An organization series, wired the way Highcharts resolves one.
 *
 * The declaration is `from`/`to` links; the nodes are what Highcharts builds
 * from them, and it is the nodes that carry `linksTo`, the display name, the
 * `title` and the drawn box. That resolution is what this reproduces.
 *
 * @param nodes - The nodes and who each reports to
 * @returns The series, with `nodes` cross-linked
 */
function orgSeries(nodes: NodeInput[]): HighchartsSeries {
  const links = nodes.flatMap(node =>
    (node.parents ?? []).map(parent => ({ from: parent, to: node.id })));

  const series = fakeSeries({ index: 0, type: 'organization', name: 'Org', data: links });
  series.nodes = nodes.map(node => ({
    id: node.id,
    name: node.name ?? node.id,
    ...(node.title !== undefined ? { options: { title: node.title } } : {}),
    linksTo: series.data.filter(link => link.to === node.id),
    linksFrom: series.data.filter(link => link.from === node.id),
  })) as HighchartsNode[];

  return series;
}

/** Ada over Bo and Cy, with three functions below them. */
const ORG: NodeInput[] = [
  { id: 'Ada', name: 'Ada Lovelace', title: 'CEO' },
  { id: 'Bo', name: 'Bo Turing', title: 'CTO', parents: ['Ada'] },
  { id: 'Cy', title: 'CFO', parents: ['Ada'] },
  { id: 'Engineering', parents: ['Bo'] },
  { id: 'Design', parents: ['Bo'] },
  { id: 'Finance', parents: ['Cy'] },
];

/** The layer a chart of these nodes produces, or undefined when declined. */
function layerOf(nodes: NodeInput[]) {
  const chart = fakeChart({ renderToId: 'org-chart', series: [orgSeries(nodes)] });
  return highchartsToMaidr(chart).subplots[0][0].layers[0];
}

describe('highcharts organization', () => {
  it('reads an org chart as a tree rather than declining it', () => {
    const layer = layerOf(ORG);

    expect(layer.type).toBe(TraceType.TREEMAP);
    expect(layer.title).toBe('Org');
    expect(layer.data).toHaveLength(6);
  });

  it('declares no magnitude, because the chart draws none', () => {
    // The whole reason this was blocked. Highcharts' own `sum` is 1 on every
    // node, and declaring it announced two siblings as 100% of their parent
    // each; omitting it announced 0 everywhere. The trace now reads a tree
    // that declares nothing as one that has nothing.
    const data = layerOf(ORG).data as TreemapPoint[];

    expect(data.every(point => point.y === undefined)).toBe(true);
  });

  it('names no second axis either', () => {
    // A label on an axis the chart does not draw is the same claim in a
    // quieter place.
    expect(layerOf(ORG).axes).toEqual({ x: { label: 'Node' } });
  });

  it('says what the box says: the name and the role under it', () => {
    const data = layerOf(ORG).data as TreemapPoint[];

    expect(data[0].x).toBe('Ada Lovelace, CEO');
    expect(data[1].x).toBe('Bo Turing, CTO');
  });

  it('falls back to the id, which is what Highcharts names the node', () => {
    // `Cy` declares no `name` and `Engineering` declares neither, so the
    // label is whatever the box has to show.
    const data = layerOf(ORG).data as TreemapPoint[];

    expect(data[2].x).toBe('Cy, CFO');
    expect(data[3].x).toBe('Engineering');
  });

  it('says a name and a title that happen to match only once', () => {
    // Reachable, if unusual: someone whose name field carries their role.
    // The box draws it twice; announcing it twice is noise rather than
    // information.
    const data = layerOf([{ id: 'x', name: 'CEO', title: 'CEO' }]).data as TreemapPoint[];

    expect(data[0].x).toBe('CEO');
  });

  it('carries a node ancestry as the path the tree is addressed by', () => {
    const data = layerOf(ORG).data as TreemapPoint[];

    expect(data[0].path).toEqual([]);
    expect(data[1].path).toEqual(['Ada Lovelace, CEO']);
    expect(data[3].path).toEqual(['Ada Lovelace, CEO', 'Bo Turing, CTO']);
  });

  it('addresses each drawn box by its own index', () => {
    // Measured in Chromium: each of these matched exactly one
    // `path.highcharts-node`.
    const selectors = layerOf(ORG).selectors as string[];

    expect(selectors).toHaveLength(6);
    expect(selectors[0]).toBe(
      '#org-chart .highcharts-series-group .highcharts-series-0 [data-maidr-node-index="0"]',
    );
  });

  it('declines a chart where someone reports to two managers', () => {
    // A tree cannot say that, and reading it as one would drop a link the
    // chart plainly draws. A silently missing edge is worse than the
    // fallback, which at least says what it is.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const twoBosses: NodeInput[] = [
      { id: 'Ada' },
      { id: 'Cy' },
      { id: 'Bo', parents: ['Ada', 'Cy'] },
    ];

    const chart = fakeChart({ renderToId: 'two', series: [orgSeries(twoBosses)] });

    expect(highchartsToMaidr(chart).subplots[0][0].layers).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('more than one'));
    warn.mockRestore();
  });

  it('cuts a path that loops rather than walking it forever', () => {
    // The node itself seeds the seen set, so the walk stops at the first
    // step back onto it: Ada's path is Bo and nothing beyond.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const cyclic: NodeInput[] = [
      { id: 'Ada', parents: ['Bo'] },
      { id: 'Bo', parents: ['Ada'] },
    ];

    const data = layerOf(cyclic).data as TreemapPoint[];

    expect(data).toHaveLength(2);
    expect(data[0].path).toEqual(['Bo']);
    expect(data[1].path).toEqual(['Ada']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cycle'));
    warn.mockRestore();
  });

  it('stamps each drawn box with the index its selector addresses', () => {
    // The selectors are useless without the stamp, and an organization
    // series' `data` is its links -- so the walk has to run over the nodes
    // rather than over the points, which is what this pins.
    const series = orgSeries(ORG);
    const elements = (series.nodes ?? []).map(() => ({
      setAttribute: jest.fn(),
    }));
    (series.nodes ?? []).forEach((node, i) => {
      node.graphic = { element: elements[i] as unknown as SVGElement };
    });

    highchartsToMaidr(fakeChart({ renderToId: 'stamped', series: [series] }));

    expect(elements[0].setAttribute).toHaveBeenCalledWith('data-maidr-node-index', '0');
    expect(elements[5].setAttribute).toHaveBeenCalledWith('data-maidr-node-index', '5');
  });

  it('declines a series that resolved no nodes at all', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = fakeChart({ renderToId: 'empty', series: [orgSeries([])] });

    expect(highchartsToMaidr(chart).subplots[0][0].layers).toHaveLength(0);
    warn.mockRestore();
  });
});
