/**
 * @jest-environment jsdom
 */

import type { AbstractTrace } from '@model/abstract';
import type { MaidrLayer } from '@type/grammar';
import { c4DiagramType } from '@adapters/mermaid/diagramTypes';
import { describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { DiagramType } from '@type/grammar';
import { en } from '@util/i18n/en';
import { convert, layersOf } from './helpers';

/**
 * Which diagram each Mermaid diagram says it is, and the name and guide the
 * description gives to it (`diagramTypes.ts`).
 *
 * A diagram read as a layer type it is not was named and explained as that
 * type: a class diagram was a directed graph "used to show how something is
 * computed", a kanban board a tree whose lines "branch out" from a root.
 * Stand-in databases shaped as Mermaid 12's; see `./helpers`.
 */

/** A diagram of one node, as `getData()` hands it to the unified readers. */
const oneNode = { getData: () => ({ nodes: [{ id: 'A', label: 'A' }], edges: [] }) };

/**
 * Each Mermaid diagram type read as a layer type it is not, the smallest
 * database that makes a layer of it, and the diagram its layers should say
 * they are.
 */
const NAMED: [string, object, DiagramType][] = [
  ['flowchart-v2', oneNode, DiagramType.FLOWCHART],
  ['flowchart-elk', oneNode, DiagramType.FLOWCHART],
  ['graph', oneNode, DiagramType.FLOWCHART],
  ['swimlane', oneNode, DiagramType.SWIMLANE],
  ['agentflow', oneNode, DiagramType.AGENT_FLOW],
  ['stateDiagram', oneNode, DiagramType.STATE],
  ['classDiagram', oneNode, DiagramType.CLASS],
  ['er', oneNode, DiagramType.ENTITY_RELATIONSHIP],
  ['requirement', oneNode, DiagramType.REQUIREMENT],
  ['usecase', oneNode, DiagramType.USE_CASE],
  ['c4', { getC4Type: () => 'C4Context', getC4ShapeArray: () => [{ alias: 'a', label: 'A' }] }, DiagramType.C4_CONTEXT],
  ['block', { getBlocks: () => [{ id: 'a', label: 'A', type: 'square' }] }, DiagramType.BLOCK],
  ['architecture', { getServices: () => [{ id: 'a', title: 'A' }] }, DiagramType.ARCHITECTURE],
  ['gitGraph', { getCommitsArray: () => [{ id: 'a', seq: 0, message: 'init', branch: 'main', parents: [] }] }, DiagramType.GIT_GRAPH],
  ['eventmodeling', {
    getState: () => ({ boxes: [{ index: 0, text: 'CartUI', frame: { name: '01', modelEntityType: 'ui' } }], relations: [] }),
  }, DiagramType.EVENT_MODEL],
  ['mindmap', { getMindmap: () => ({ id: 0, descr: 'Root' }) }, DiagramType.MINDMAP],
  ['kanban', {
    getData: () => ({ nodes: [{ id: 'todo', label: 'To do', isGroup: true }, { id: 'a', label: 'A', parentId: 'todo' }] }),
  }, DiagramType.KANBAN],
  ['treeView', { getRoot: () => ({ name: '/', nodeType: 'directory' }) }, DiagramType.TREE_VIEW],
  ['ishikawa', { getRoot: () => ({ text: 'Blurry photo' }) }, DiagramType.ISHIKAWA],
  ['timeline', { getSections: () => [], getTasks: () => [{ task: '1999', events: ['WCAG 1.0'] }] }, DiagramType.TIMELINE],
  ['railroadEbnf', { getRules: () => [{ name: 'digit', definition: { type: 'terminal', value: '0' } }] }, DiagramType.RAILROAD],
  ['cynefin', {
    getDomains: () => new Map([['complex', { name: 'complex', items: [] }], ['clear', { name: 'clear', items: [] }]]),
    getTransitions: () => [{ from: 'complex', to: 'clear', label: 'codified' }],
  }, DiagramType.CYNEFIN],
  ['quadrantChart', {
    getQuadrantData: () => ({
      quadrants: [{ x: 0, y: 0, width: 100, height: 100, text: { text: 'Expand' } }],
      points: [{ x: 10, y: 90, text: { text: 'A' } }],
    }),
  }, DiagramType.QUADRANT],
  ['journey', { getTasks: () => [{ section: 'Go to work', task: 'Make tea', score: 5, people: ['Me'] }] }, DiagramType.USER_JOURNEY],
  ['packet', { getPacket: () => [[{ start: 0, end: 15, label: 'Source port' }]] }, DiagramType.PACKET],
  ['wardley', {
    getWardleyData: () => ({
      nodes: [{ id: 'User', label: 'User', x: 50, y: 95 }, { id: 'Tea', label: 'Tea', x: 80, y: 60 }],
      links: [{ source: 'User', target: 'Tea' }],
      trends: [],
    }),
  }, DiagramType.WARDLEY_MAP],
];

/**
 * Each diagram that is the chart its layer type names, and the smallest
 * database that makes a layer of it.
 */
const UNNAMED: [string, object][] = [
  ['pie', { getSections: () => new Map([['Dogs', 386]]) }],
  ['gantt', {
    getTasks: () => [{ id: 'r1', task: 'Research', section: 'Design', startTime: new Date(Date.UTC(2026, 0, 5)), endTime: new Date(Date.UTC(2026, 0, 15)) }],
  }],
  ['xychart', {
    getXYChartData: () => ({
      xAxis: { type: 'band', categories: ['jan'] },
      plots: [{ type: 'bar', data: [['jan', 5000]] }, { type: 'line', data: [['jan', 5000]] }],
    }),
  }],
  ['radar', {
    getAxes: () => [{ name: 'm', label: 'Math' }, { name: 's', label: 'Science' }],
    getCurves: () => [{ name: 'a', label: 'Alice', entries: [85, 90] }],
  }],
  ['sankey', { getLinks: () => [{ source: 'Solar', target: 'Electricity', value: 40 }] }],
  ['treemap', { getRoot: () => ({ name: '', children: [{ name: 'Products', children: [{ name: 'Laptops', value: 52 }] }] }) }],
  ['sequence', {
    getActorKeys: () => ['U', 'W'],
    getActors: () => new Map([['U', { description: 'User', type: 'actor' }], ['W', { description: 'Web app', type: 'participant' }]]),
    getMessages: () => [{ id: '0', type: 0, from: 'U', to: 'W', message: 'Log in' }],
  }],
  ['venn', { getSubsetData: () => [{ sets: ['A'], size: 2, label: 'Frontend' }] }],
];

/**
 * A layer as the description dialog shows it.
 *
 * @param layer - The layer
 * @returns Its Chart Type line and its "About this chart type" guide
 */
function described(layer: MaidrLayer): { chartType: string; guide: unknown } {
  const trace = TraceFactory.create(layer) as AbstractTrace;
  return { chartType: trace.description.chartType, guide: trace.guide };
}

describe('the type a diagram is named and explained as', () => {
  it.each(NAMED)('names %s for the diagram it is, with a guide to it', (type, db, expected) => {
    const layers = layersOf(convert(type, db));
    const guide = expected.startsWith('c4_') ? DiagramType.C4 : expected;

    expect(layers.length).toBeGreaterThan(0);
    for (const layer of layers) {
      expect(layer.diagramType).toBe(expected);
      expect(layer.typeLabel).toBeUndefined();
      expect(described(layer)).toEqual({
        chartType: en[`diagram.${expected}.name`],
        guide: {
          definition: en[`diagram.${guide}.definition` as keyof typeof en],
          purpose: en[`diagram.${guide}.purpose` as keyof typeof en],
          appearance: en[`diagram.${guide}.appearance` as keyof typeof en],
        },
      });
    }
  });

  it.each(UNNAMED)('keeps the name and guide of the chart a %s is', (type, db) => {
    const layers = layersOf(convert(type, db));

    expect(layers.length).toBeGreaterThan(0);
    for (const layer of layers) {
      expect(layer.diagramType).toBeUndefined();
      expect(layer.typeLabel).toBeUndefined();
      expect(described(layer).guide).toBeDefined();
    }
  });

  it('names a C4 diagram for the level it was written at', () => {
    expect(c4DiagramType('C4Container')).toBe(DiagramType.C4_CONTAINER);
    expect(c4DiagramType('C4Deployment')).toBe(DiagramType.C4_DEPLOYMENT);
    expect(c4DiagramType(undefined)).toBe(DiagramType.C4);
    expect(c4DiagramType('constructor')).toBe(DiagramType.C4);
  });
});
