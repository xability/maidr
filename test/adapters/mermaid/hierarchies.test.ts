/**
 * @jest-environment jsdom
 */

import type { DirectedGraphPoint, TreemapPoint } from '@type/grammar';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { convert, drawn, layersOf, matched } from './helpers';

/**
 * The hierarchies (`diagrams/hierarchies.ts`): mindmap, timeline, railroad and Cynefin.
 *
 * Stand-in databases shaped as Mermaid 12's; see `./helpers`.
 */

describe('the hierarchies', () => {
  it('reads a mindmap from its root, numbering siblings that share a name', () => {
    const layer = layersOf(convert('mindmap', {
      getMindmap: () => ({ id: 0, descr: 'Root', children: [{ id: 1, descr: 'Uses' }, { id: 2, descr: 'Uses' }] }),
    }, drawn('m', '<g class="node" id="m-node_0"></g><g class="node" id="m-node_1"></g><g class="node" id="m-node_2"></g>')))[0];
    expect(layer.type).toBe(TraceType.TREE);
    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'Root' },
      { x: 'Uses', path: ['Root'] },
      { x: 'Uses (2)', path: ['Root'] },
    ]);
    expect(matched(layer)).toBe(3);
  });

  it('reads a timeline as sections, periods and events', () => {
    const data = layersOf(convert('timeline', {
      getSections: () => ['Early'],
      getTasks: () => [{ section: 'Early', task: '2002 ', events: ['LinkedIn'] }],
    }))[0].data as TreemapPoint[];
    expect(data).toEqual([{ x: 'Early' }, { x: '2002', path: ['Early'] }, { x: 'LinkedIn', path: ['Early', '2002'] }]);
  });

  it('reads a railroad rule as the expression it is made of', () => {
    const data = layersOf(convert('railroadEbnf', {
      getRules: () => [{
        name: 'sign',
        definition: { type: 'choice', alternatives: [{ type: 'terminal', value: '+' }, { type: 'nonterminal', name: 'minus' }] },
      }],
    }))[0].data as TreemapPoint[];
    expect(data.map(point => point.x)).toEqual(['sign', 'one of', '"+"', 'rule minus']);
  });

  it('reads Cynefin domains, and their transitions as a second layer', () => {
    const layers = layersOf(convert('cynefin', {
      getDomains: () => new Map([['complex', { name: 'complex', items: [{ label: 'Research' }] }], ['clear', { name: 'clear', items: [] }]]),
      getTransitions: () => [{ from: 'complex', to: 'clear', label: 'codified' }],
    }));
    expect(layers.map(layer => layer.type)).toEqual([TraceType.TREE, TraceType.DIRECTED_GRAPH]);
    expect((layers[1].data as DirectedGraphPoint[])[1]).toMatchObject({ label: 'Clear', inputs: ['complex'], inputLabels: ['codified'] });
  });
});
