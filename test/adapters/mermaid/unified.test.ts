/**
 * @jest-environment jsdom
 */

import type { DirectedGraphPoint } from '@type/grammar';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { convert, drawn, layersOf, matched } from './helpers';

/**
 * The diagrams Mermaid lays out as one graph (`diagrams/unified.ts`): flowcharts, class, entity-relationship and state diagrams.
 *
 * Stand-in databases shaped as Mermaid 12's; see `./helpers`.
 */

describe('a flowchart', () => {
  /** A decision inside a subgraph, an edge out of the subgraph, a note-less chart. */
  const db = {
    getData: () => ({
      nodes: [
        { id: 'one', label: 'Group One', isGroup: true },
        { id: 'A', label: 'Start', domId: 'flowchart-A-0', shape: 'squareRect', isGroup: false },
        { id: 'B', label: 'Is it?', domId: 'flowchart-B-1', shape: 'diamond', isGroup: false, parentId: 'one' },
        { id: 'C', label: 'OK', domId: 'flowchart-C-2', isGroup: false, parentId: 'one' },
        { id: 'F', label: 'Done', domId: 'flowchart-F-3', isGroup: false },
      ],
      edges: [
        { start: 'A', end: 'B', label: '' },
        { start: 'B', end: 'C', label: 'Yes' },
        { start: 'B', end: 'A', label: 'No' },
        { start: 'one', end: 'F', label: '' },
      ],
    }),
  };
  // The drawing's counters ran on from a different parse, as they do.
  const markup = ['A-7', 'B-8', 'C-9', 'F-10']
    .map(id => `<g class="node" id="f-flowchart-${id}"></g>`)
    .join('');

  it('becomes a directed graph with the subgraph as a scope', () => {
    const layer = layersOf(convert('flowchart-v2', db, drawn('f', markup)))[0];
    const data = layer.data as DirectedGraphPoint[];
    expect(layer.type).toBe(TraceType.DIRECTED_GRAPH);
    expect(data.map(point => point.id)).toEqual(['A', 'B', 'C', 'F']);
    expect(data[1]).toMatchObject({ label: 'Is it?', path: ['Group One'], attributes: { Shape: 'decision' } });
  });

  it('labels each edge, and leaves a subgraph from the step it ends on', () => {
    const data = layersOf(convert('flowchart-v2', db, drawn('f', markup)))[0].data as DirectedGraphPoint[];
    expect(data[2]).toMatchObject({ inputs: ['B'], inputLabels: ['Yes'] });
    expect(data[0]).toMatchObject({ inputs: ['B'], inputLabels: ['No'] });
    expect(data[3].inputs).toEqual(['C']);
  });

  it('pairs each node with its drawing although the counters moved', () => {
    const layer = layersOf(convert('flowchart-v2', db, drawn('f', markup)))[0];
    expect(matched(layer)).toBe(4);
  });

  it('withdraws the highlight rather than pair a node with the wrong box', () => {
    const layer = layersOf(convert('flowchart-v2', db, drawn('f', markup.replace(/<g[^>]*C-9[^>]*><\/g>/, ''))))[0];
    expect(layer.selectors).toBeUndefined();
  });
});

describe('a class diagram', () => {
  it('announces members and points inheritance at the parent', () => {
    const figure = convert('classDiagram', {
      getData: () => ({
        nodes: [
          { id: 'Animal', label: 'Animal', domId: 'classId-Animal-0' },
          { id: 'Duck', label: 'Duck', domId: 'classId-Duck-1' },
          { id: 'note1', label: 'can fly', shape: 'note' },
        ],
        edges: [
          { start: 'note1', end: 'Duck' },
          { start: 'Animal', end: 'Duck', arrowTypeStart: 'extension', arrowTypeEnd: 'none', pattern: 'solid' },
        ],
      }),
      getClasses: () => new Map([
        ['Animal', { id: 'Animal', members: [{ text: '\\+int age', visibility: '+' }], methods: [{ text: '-mate()', visibility: '-', classifier: '$' }], annotations: ['interface'] }],
        ['Duck', { id: 'Duck', members: [], methods: [] }],
      ]),
      getRelations: () => [{ id1: 'Animal', id2: 'Duck', relationTitle1: 'none', relationTitle2: '1..*' }],
    });
    const data = layersOf(figure)[0].data as DirectedGraphPoint[];
    expect(data.map(point => point.id)).toEqual(['Animal', 'Duck']);
    expect(data[0].attributes).toEqual({
      Annotation: 'interface',
      Attributes: 'public int age',
      Methods: 'private mate(), static',
    });
    expect(data[0]).toMatchObject({ inputs: ['Duck'], inputLabels: ['inherits from, cardinality 1..*'] });
    expect(data[1].attributes).toEqual({ Note: 'can fly' });
  });

  it('tells an association from a dependency by its line', () => {
    const figure = convert('classDiagram', {
      getData: () => ({
        nodes: [{ id: 'Teacher' }, { id: 'Student' }, { id: 'Book' }],
        edges: [
          { start: 'Teacher', end: 'Student', label: 'teaches', arrowTypeStart: 'none', arrowTypeEnd: 'dependency', pattern: 'solid' },
          { start: 'Student', end: 'Book', arrowTypeStart: 'none', arrowTypeEnd: 'dependency', pattern: 'dashed' },
        ],
      }),
      getClasses: () => new Map(),
      getRelations: () => [
        { id1: 'Teacher', id2: 'Student', relationTitle1: 'none', relationTitle2: 'none' },
        { id1: 'Student', id2: 'Book', relationTitle1: 'none', relationTitle2: 'none' },
      ],
    });

    const [, student, book] = layersOf(figure)[0].data as DirectedGraphPoint[];

    expect(student).toMatchObject({ inputs: ['Teacher'], inputLabels: ['teaches, associated with'] });
    expect(book).toMatchObject({ inputs: ['Student'], inputLabels: ['depends on'] });
  });

  it('reads a relation with a head at each end both ways, each in its own head\'s words', () => {
    const figure = convert('classDiagram', {
      getData: () => ({
        nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
        edges: [
          { start: 'A', end: 'B', label: 'talks', arrowTypeStart: 'dependency', arrowTypeEnd: 'dependency', pattern: 'solid' },
          { start: 'C', end: 'D', arrowTypeStart: 'extension', arrowTypeEnd: 'dependency', pattern: 'dashed' },
        ],
      }),
      getClasses: () => new Map(),
      getRelations: () => [
        { id1: 'A', id2: 'B', relationTitle1: 'none', relationTitle2: 'none' },
        { id1: 'C', id2: 'D', relationTitle1: 'none', relationTitle2: 'none' },
      ],
    });

    const [a, b, c, d] = layersOf(figure)[0].data as DirectedGraphPoint[];

    expect(a).toMatchObject({ inputs: ['B'], inputLabels: ['talks, associated with'] });
    expect(b).toMatchObject({ inputs: ['A'], inputLabels: ['talks, associated with'] });
    expect(c).toMatchObject({ inputs: ['D'], inputLabels: ['realizes'] });
    expect(d).toMatchObject({ inputs: ['C'], inputLabels: ['depends on'] });
  });
});

describe('an entity-relationship diagram', () => {
  it('labels a relationship with its verb and both cardinalities', () => {
    const figure = convert('er', {
      getData: () => ({
        nodes: [{ id: 'entity-CUSTOMER-0', label: 'CUSTOMER' }, { id: 'entity-ORDER-1', label: 'ORDER' }],
        edges: [{ start: 'entity-CUSTOMER-0', end: 'entity-ORDER-1', label: 'places', arrowTypeStart: 'only_one', arrowTypeEnd: 'zero_or_more', pattern: 'solid' }],
      }),
      getEntities: () => new Map([
        ['CUSTOMER', { id: 'entity-CUSTOMER-0', attributes: [{ type: 'string', name: 'name', keys: ['PK'], comment: '' }] }],
      ]),
    });
    const data = layersOf(figure)[0].data as DirectedGraphPoint[];
    expect(data[0]).toMatchObject({ label: 'CUSTOMER', attributes: { Attributes: 'string name PK' } });
    expect(data[1].inputLabels).toEqual(['places, exactly one to zero or more']);
  });
});

describe('a state diagram', () => {
  it('names the pseudo-states, enters a composite state on its initial state, and numbers regions', () => {
    const figure = convert('stateDiagram', {
      getData: () => ({
        nodes: [
          { id: 'root_start', shape: 'stateStart' },
          { id: 'Active', label: 'Active', isGroup: true },
          { id: 'divider-1', label: '', shape: 'divider', isGroup: true, parentId: 'Active' },
          { id: 'inner_start', shape: 'stateStart', parentId: 'divider-1' },
          { id: 'On', label: 'On', parentId: 'divider-1' },
        ],
        edges: [
          { start: 'root_start', end: 'Active' },
          { start: 'inner_start', end: 'On' },
        ],
      }),
    });
    const data = layersOf(figure)[0].data as DirectedGraphPoint[];
    expect(data.map(point => point.label ?? point.id)).toEqual(['start', 'start', 'On']);
    expect(data[1]).toMatchObject({ path: ['Active', 'region 1'], inputs: ['root_start'] });
    expect(data[2].inputs).toEqual(['inner_start']);
  });
});
