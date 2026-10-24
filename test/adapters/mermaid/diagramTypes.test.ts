/**
 * @jest-environment jsdom
 */

import type { DiagramType } from '@adapters/mermaid/diagramTypes';
import type { AbstractTrace } from '@model/abstract';
import type { MaidrLayer } from '@type/grammar';
import { c4DiagramType, DIAGRAM_TYPES } from '@adapters/mermaid/diagramTypes';
import { describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { convert, layersOf } from './helpers';

/**
 * What each diagram is called, and the guide the description gives to it
 * (`diagramTypes.ts`).
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
 * database that makes a layer of it, and the type its layers should name.
 */
const NAMED: [string, object, DiagramType][] = [
  ['flowchart-v2', oneNode, DIAGRAM_TYPES.flowchart],
  ['flowchart-elk', oneNode, DIAGRAM_TYPES.flowchart],
  ['graph', oneNode, DIAGRAM_TYPES.flowchart],
  ['swimlane', oneNode, DIAGRAM_TYPES.swimlane],
  ['agentflow', oneNode, DIAGRAM_TYPES.agentflow],
  ['stateDiagram', oneNode, DIAGRAM_TYPES.state],
  ['classDiagram', oneNode, DIAGRAM_TYPES.class],
  ['er', oneNode, DIAGRAM_TYPES.entityRelationship],
  ['requirement', oneNode, DIAGRAM_TYPES.requirement],
  ['usecase', oneNode, DIAGRAM_TYPES.usecase],
  ['c4', { getC4Type: () => 'C4Context', getC4ShapeArray: () => [{ alias: 'a', label: 'A' }] }, c4DiagramType('C4Context')],
  ['block', { getBlocks: () => [{ id: 'a', label: 'A', type: 'square' }] }, DIAGRAM_TYPES.block],
  ['architecture', { getServices: () => [{ id: 'a', title: 'A' }] }, DIAGRAM_TYPES.architecture],
  ['gitGraph', { getCommitsArray: () => [{ id: 'a', seq: 0, message: 'init', branch: 'main', parents: [] }] }, DIAGRAM_TYPES.gitGraph],
  ['eventmodeling', {
    getState: () => ({ boxes: [{ index: 0, text: 'CartUI', frame: { name: '01', modelEntityType: 'ui' } }], relations: [] }),
  }, DIAGRAM_TYPES.eventModel],
  ['mindmap', { getMindmap: () => ({ id: 0, descr: 'Root' }) }, DIAGRAM_TYPES.mindmap],
  ['kanban', {
    getData: () => ({ nodes: [{ id: 'todo', label: 'To do', isGroup: true }, { id: 'a', label: 'A', parentId: 'todo' }] }),
  }, DIAGRAM_TYPES.kanban],
  ['treeView', { getRoot: () => ({ name: '/', nodeType: 'directory' }) }, DIAGRAM_TYPES.treeView],
  ['ishikawa', { getRoot: () => ({ text: 'Blurry photo' }) }, DIAGRAM_TYPES.ishikawa],
  ['timeline', { getSections: () => [], getTasks: () => [{ task: '1999', events: ['WCAG 1.0'] }] }, DIAGRAM_TYPES.timeline],
  ['railroadEbnf', { getRules: () => [{ name: 'digit', definition: { type: 'terminal', value: '0' } }] }, DIAGRAM_TYPES.railroad],
  ['cynefin', {
    getDomains: () => new Map([['complex', { name: 'complex', items: [] }], ['clear', { name: 'clear', items: [] }]]),
    getTransitions: () => [{ from: 'complex', to: 'clear', label: 'codified' }],
  }, DIAGRAM_TYPES.cynefin],
  ['quadrantChart', {
    getQuadrantData: () => ({
      quadrants: [{ x: 0, y: 0, width: 100, height: 100, text: { text: 'Expand' } }],
      points: [{ x: 10, y: 90, text: { text: 'A' } }],
    }),
  }, DIAGRAM_TYPES.quadrant],
  ['journey', { getTasks: () => [{ section: 'Go to work', task: 'Make tea', score: 5, people: ['Me'] }] }, DIAGRAM_TYPES.journey],
  ['packet', { getPacket: () => [[{ start: 0, end: 15, label: 'Source port' }]] }, DIAGRAM_TYPES.packet],
  ['wardley', {
    getWardleyData: () => ({
      nodes: [{ id: 'User', label: 'User', x: 50, y: 95 }, { id: 'Tea', label: 'Tea', x: 80, y: 60 }],
      links: [{ source: 'User', target: 'Tea' }],
      trends: [],
    }),
  }, DIAGRAM_TYPES.wardley],
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

    expect(layers.length).toBeGreaterThan(0);
    for (const layer of layers) {
      expect(layer.typeLabel).toBe(expected.typeLabel);
      expect(described(layer)).toEqual({ chartType: expected.typeLabel, guide: expected.typeGuide });
    }
  });

  it.each(UNNAMED)('keeps the name and guide of the chart a %s is', (type, db) => {
    const layers = layersOf(convert(type, db));

    expect(layers.length).toBeGreaterThan(0);
    for (const layer of layers) {
      expect(layer.typeLabel).toBeUndefined();
      expect(described(layer).guide).toBeDefined();
    }
  });

  it('names a C4 diagram for the level it was written at', () => {
    expect(c4DiagramType('C4Container').typeLabel).toBe('C4 Container Diagram');
    expect(c4DiagramType('C4Deployment').typeLabel).toBe('C4 Deployment Diagram');
    expect(c4DiagramType(undefined).typeLabel).toBe('C4 Diagram');
    expect(c4DiagramType('constructor').typeLabel).toBe('C4 Diagram');
  });

  it('explains every diagram in all three parts, each in words of its own', () => {
    const types = Object.values(DIAGRAM_TYPES);
    const parts = types.flatMap(one => [one.typeGuide.definition, one.typeGuide.purpose, one.typeGuide.appearance]);

    expect(parts.filter(text => text.trim() === '')).toEqual([]);
    expect(new Set(parts).size).toBe(parts.length);
    expect(new Set(types.map(one => one.typeLabel)).size).toBe(types.length);
  });
});
