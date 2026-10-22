/**
 * @jest-environment jsdom
 */

import type { DirectedGraphPoint, MaidrLayer, TreemapPoint } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import { convert, drawn, layersOf, matched } from './helpers';

/**
 * The noun each move announces its node with, walking a layer as a reader does.
 *
 * @param layer - The layer
 * @param moves - The moves, after the entry onto the first node
 * @returns The label of each node reached, entry first
 */
function nouns(layer: MaidrLayer, ...moves: MovableDirection[]): string[] {
  const trace = TraceFactory.create(layer);
  const heard = (): string => (trace.state as NonEmptyTraceState).text.main.label;
  trace.moveOnce('FORWARD');
  const labels = [heard()];
  for (const move of moves) {
    trace.moveOnce(move);
    labels.push(heard());
  }
  trace.dispose();
  return labels;
}

/**
 * The hierarchies (`diagrams/hierarchies.ts`): mindmap, timeline, kanban, Ishikawa, railroad
 * and Cynefin.
 *
 * Stand-in databases shaped as Mermaid 12's; see `./helpers`.
 */

/**
 * A Cynefin drawing as Mermaid lays it out: three of its domain labels, the
 * framework text under them when it draws any, and one item.
 *
 * @param descriptions - Whether Mermaid drew the framework text
 * @returns The drawing
 */
function cynefinDrawing(descriptions: boolean): SVGSVGElement {
  const label = (x: number, y: number, text: string): string =>
    `<text class="cynefinDomainLabel" x="${x}" y="${y}">${text}</text>`;
  const line = (x: number, y: number, text: string): string =>
    descriptions ? `<text class="cynefinSubtitle" x="${x}" y="${y}">${text}</text>` : '';
  return drawn('c', [
    label(200, 120, 'Complex'),
    label(200, 420, 'Chaotic'),
    label(400, 290, 'Confusion'),
    line(200, 140, 'Probe → Sense → Respond'),
    line(200, 155, 'Emergent Practices'),
    line(200, 440, 'Act → Sense → Respond'),
    line(200, 455, 'Novel Practices'),
    line(400, 308, 'Disorder'),
    '<text class="cynefinItemText">Research</text>',
  ].join(''));
}

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
    expect(data).toEqual([
      { x: 'Early', kind: 'Section' },
      { x: '2002', path: ['Early'], kind: 'Period' },
      { x: 'LinkedIn', path: ['Early', '2002'], kind: 'Event' },
    ]);
  });

  it('reads a kanban board as columns of cards, each named for what it is', () => {
    const layer = layersOf(convert('kanban', {
      getData: () => ({
        nodes: [
          { id: 'todo', label: 'To do', isGroup: true },
          { id: 'docs', label: 'Write the docs', parentId: 'todo', isGroup: false, assigned: 'ana' },
        ],
      }),
    }))[0];
    // Neither level alone: the board's items are its columns and its cards.
    expect(layer.axes?.x?.label).toBe('Item');
    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'To do', kind: 'Column' },
      { x: 'Write the docs (assigned to ana)', path: ['To do'], kind: 'Card' },
    ]);
    expect(nouns(layer, 'DOWNWARD')).toEqual(['Column', 'Card']);
  });

  it('reads an Ishikawa diagram from the effect to its categories and their causes', () => {
    const layer = layersOf(convert('ishikawa', {
      getRoot: () => ({
        text: 'Blurry photo',
        children: [{ text: 'Equipment', children: [{ text: 'Lens', children: [{ text: 'Dirty lens' }] }] }],
      }),
    }))[0];
    expect((layer.data as TreemapPoint[]).map(point => point.kind)).toEqual(['Effect', 'Category', 'Cause', 'Cause']);
    expect(nouns(layer, 'DOWNWARD', 'DOWNWARD', 'DOWNWARD')).toEqual(['Effect', 'Category', 'Cause', 'Cause']);
  });

  it('reads a railroad rule as the expression it is made of', () => {
    const data = layersOf(convert('railroadEbnf', {
      getRules: () => [{
        name: 'sign',
        definition: { type: 'choice', alternatives: [{ type: 'terminal', value: '+' }, { type: 'nonterminal', name: 'minus' }] },
      }],
    }))[0].data as TreemapPoint[];
    expect(data.map(point => [point.x, point.kind])).toEqual([
      ['sign', 'Rule'],
      ['one of', 'Expression'],
      ['"+"', 'Terminal'],
      ['rule minus', 'Reference'],
    ]);
  });

  it('reads Cynefin domains, and their transitions as a second layer', () => {
    const layers = layersOf(convert('cynefin', {
      getDomains: () => new Map([['complex', { name: 'complex', items: [{ label: 'Research' }] }], ['clear', { name: 'clear', items: [] }]]),
      getTransitions: () => [{ from: 'complex', to: 'clear', label: 'codified' }],
    }));
    expect(layers.map(layer => layer.type)).toEqual([TraceType.TREE, TraceType.DIRECTED_GRAPH]);
    expect(nouns(layers[0], 'DOWNWARD')).toEqual(['Domain', 'Item']);
    expect((layers[1].data as DirectedGraphPoint[])[1]).toMatchObject({ label: 'Clear', inputs: ['complex'], inputLabels: ['codified'] });
  });
  it('outlines a Cynefin transition\'s domain by the label the domains layer outlines', () => {
    const layers = layersOf(convert('cynefin', {
      getDomains: () => new Map([['complex', { name: 'complex', items: [{ label: 'Research' }] }], ['chaotic', { name: 'chaotic', items: [] }]]),
      getTransitions: () => [{ from: 'chaotic', to: 'complex', label: 'stabilised' }],
    }, cynefinDrawing(false)));
    const label = (selector: string): Element | null => document.querySelector(selector);
    const graph = layers[1].selectors as string[];
    expect(graph.map(label)).toEqual([label('text.cynefinDomainLabel:nth-of-type(1)'), label('text.cynefinDomainLabel:nth-of-type(2)')]);

    // Built as MAIDR builds them, the domains first: the copies the first
    // layer hides beside its labels are not counted by the second.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const domains = TraceFactory.create(layers[0]);
    const transitions = TraceFactory.create(layers[1]);
    expect(transitions.getAllHighlightElements()).toHaveLength(2);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('resolved to no element');
    transitions.dispose();
    domains.dispose();
    warn.mockRestore();
  });

  it('reads the framework text drawn under each domain, and the domains drawn but left empty', () => {
    const layer = layersOf(convert('cynefin', {
      getDomains: () => new Map([['complex', { name: 'complex', items: [{ label: 'Research' }] }]]),
      getTransitions: () => [],
    }, cynefinDrawing(true)))[0];
    const complex = 'Complex (Probe → Sense → Respond, Emergent Practices)';
    expect(layer.data as TreemapPoint[]).toEqual([
      { x: complex, kind: 'Domain' },
      { x: 'Research', path: [complex], kind: 'Item' },
      { x: 'Chaotic (Act → Sense → Respond, Novel Practices)', kind: 'Domain' },
      { x: 'Confusion (Disorder)', kind: 'Domain' },
    ]);
    // Each still on its own drawn label.
    expect(matched(layer)).toBe(4);
  });

  it('reads the framework text as the drawing shows it, not as markup', () => {
    const drawing = drawn('c', [
      '<text class="cynefinDomainLabel" x="200" y="120">Clear</text>',
      '<text class="cynefinSubtitle" x="200" y="140">Sense &lt;Categorize&gt; &amp;amp; Respond</text>',
    ].join(''));

    const layer = layersOf(convert('cynefin', {
      getDomains: () => new Map([['clear', { name: 'clear', items: [] }]]),
      getTransitions: () => [],
    }, drawing))[0];

    expect((layer.data as TreemapPoint[]).map(point => point.x))
      .toEqual(['Clear (Sense <Categorize> &amp; Respond)']);
  });

  it('leaves a domain\'s name bare when Mermaid draws no framework text', () => {
    const layer = layersOf(convert('cynefin', {
      getDomains: () => new Map([['complex', { name: 'complex', items: [] }]]),
      getTransitions: () => [],
    }, cynefinDrawing(false)))[0];
    expect((layer.data as TreemapPoint[]).map(point => point.x)).toEqual(['Complex', 'Chaotic', 'Confusion']);
  });
});
