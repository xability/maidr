/**
 * @jest-environment jsdom
 */

import type { DirectedGraphPoint } from '@type/grammar';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { convert, drawn, layersOf, matched } from './helpers';

/**
 * The diagrams Mermaid lays out as one graph (`diagrams/unified.ts`): flowcharts, class, entity-relationship, state and requirement diagrams.
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

  it('leaves a subgraph that ends in a loop from the loop, not the step it starts on', () => {
    const figure = convert('flowchart-v2', {
      getData: () => ({
        nodes: [
          { id: 'sub', label: 'Retry', isGroup: true },
          { id: 's', label: 'Send', parentId: 'sub' },
          { id: 't', label: 'Wait', parentId: 'sub' },
          { id: 'w', label: 'Check', parentId: 'sub' },
          { id: 'done', label: 'Done' },
        ],
        edges: [
          { start: 's', end: 't' },
          { start: 't', end: 'w' },
          { start: 'w', end: 't' },
          { start: 'sub', end: 'done' },
        ],
      }),
    });

    const done = (layersOf(figure)[0].data as DirectedGraphPoint[])[3];

    expect(done.inputs).toEqual(['t', 'w']);
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
    expect(data[0]).toMatchObject({ inputs: ['Duck'], inputLabels: ['inherits from, cardinality 1..* Duck'] });
    expect(data[1].attributes).toEqual({ Note: 'can fly' });
  });

  it('runs a composition or aggregation from the whole its diamond marks, cardinalities in the order read', () => {
    // `Car "1" *-- "4" Wheel : has`, `Duck "*" --o "1" Pond`, `Animal "1" <|-- "many" Duck` and `Car *--> Engine`.
    const figure = convert('classDiagram', {
      getData: () => ({
        nodes: [{ id: 'Car' }, { id: 'Wheel' }, { id: 'Duck' }, { id: 'Pond' }, { id: 'Animal' }, { id: 'Engine' }],
        edges: [
          { start: 'Car', end: 'Wheel', label: 'has', arrowTypeStart: 'composition', arrowTypeEnd: 'none', pattern: 'solid' },
          { start: 'Duck', end: 'Pond', arrowTypeStart: 'none', arrowTypeEnd: 'aggregation', pattern: 'solid' },
          { start: 'Animal', end: 'Duck', arrowTypeStart: 'extension', arrowTypeEnd: 'none', pattern: 'solid' },
          { start: 'Car', end: 'Engine', arrowTypeStart: 'composition', arrowTypeEnd: 'dependency', pattern: 'solid' },
        ],
      }),
      getClasses: () => new Map(),
      getRelations: () => [
        { id1: 'Car', id2: 'Wheel', relationTitle1: '1', relationTitle2: '4' },
        { id1: 'Duck', id2: 'Pond', relationTitle1: '*', relationTitle2: '1' },
        { id1: 'Animal', id2: 'Duck', relationTitle1: '1', relationTitle2: 'many' },
        { id1: 'Car', id2: 'Engine', relationTitle1: 'none', relationTitle2: 'none' },
      ],
    });

    const [car, wheel, duck, pond, animal, engine] = layersOf(figure)[0].data as DirectedGraphPoint[];

    expect(wheel).toMatchObject({ inputs: ['Car'], inputLabels: ['has, composed of, cardinality 1 Car to 4 Wheel'] });
    expect(duck).toMatchObject({ inputs: ['Pond'], inputLabels: ['aggregates, cardinality 1 Pond to * Duck'] });
    expect(car.inputs).toBeUndefined();
    expect(pond.inputs).toBeUndefined();
    expect(animal).toMatchObject({ inputs: ['Duck'], inputLabels: ['inherits from, cardinality many Duck to 1 Animal'] });
    expect(engine).toMatchObject({ inputs: ['Car'], inputLabels: ['composed of, associated with'] });
  });

  it('names each cardinality with its class, however the relation was written', () => {
    // `Shape "1" <|-- "many" Circle`, `Circle2 "many" --|> "1" Shape2` and `Box~T~ "0..1" <|-- Item`.
    const figure = convert('classDiagram', {
      getData: () => ({
        nodes: [{ id: 'Shape' }, { id: 'Circle' }, { id: 'Circle2' }, { id: 'Shape2' }, { id: 'Box', label: 'Box' }, { id: 'Item' }],
        edges: [
          { start: 'Shape', end: 'Circle', arrowTypeStart: 'extension', arrowTypeEnd: 'none', pattern: 'solid' },
          { start: 'Circle2', end: 'Shape2', arrowTypeStart: 'none', arrowTypeEnd: 'extension', pattern: 'solid' },
          { start: 'Box', end: 'Item', arrowTypeStart: 'extension', arrowTypeEnd: 'none', pattern: 'solid' },
        ],
      }),
      getClasses: () => new Map([['Box', { id: 'Box', type: 'T', members: [], methods: [] }]]),
      getRelations: () => [
        { id1: 'Shape', id2: 'Circle', relationTitle1: '1', relationTitle2: 'many' },
        { id1: 'Circle2', id2: 'Shape2', relationTitle1: 'many', relationTitle2: '1' },
        { id1: 'Box', id2: 'Item', relationTitle1: '0..1', relationTitle2: 'none' },
      ],
    });

    const [shape, , , shape2, box] = layersOf(figure)[0].data as DirectedGraphPoint[];

    expect(shape.inputLabels).toEqual(['inherits from, cardinality many Circle to 1 Shape']);
    expect(shape2.inputLabels).toEqual(['inherits from, cardinality many Circle2 to 1 Shape2']);
    expect(box.inputLabels).toEqual(['inherits from, cardinality 0..1 Box<T>']);
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

  it('leaves a composite state that ends in a loop from its states, not its initial state', () => {
    const figure = convert('stateDiagram', {
      getData: () => ({
        nodes: [
          { id: 'root_start', shape: 'stateStart' },
          { id: 'Idle', label: 'Idle' },
          { id: 'Running', label: 'Running', isGroup: true },
          { id: 'Running_start', shape: 'stateStart', parentId: 'Running' },
          { id: 'Loading', label: 'Loading', parentId: 'Running' },
          { id: 'Playing', label: 'Playing', parentId: 'Running' },
          { id: 'Paused', label: 'Paused', parentId: 'Running' },
          { id: 'root_end', shape: 'stateEnd' },
        ],
        edges: [
          { start: 'root_start', end: 'Idle' },
          { start: 'Idle', end: 'Running', label: 'start' },
          { start: 'Running_start', end: 'Loading' },
          { start: 'Loading', end: 'Playing', label: 'loaded' },
          { start: 'Playing', end: 'Paused', label: 'pause' },
          { start: 'Paused', end: 'Playing', label: 'resume' },
          { start: 'Running', end: 'Idle', label: 'stop' },
          { start: 'Running', end: 'root_end', label: 'quit' },
        ],
      }),
    });

    const data = layersOf(figure)[0].data as DirectedGraphPoint[];
    const byId = new Map(data.map(point => [point.id, point]));

    expect(byId.get('Idle')).toMatchObject({ inputs: ['root_start', 'Loading', 'Playing', 'Paused'], inputLabels: [null, 'stop', 'stop', 'stop'] });
    expect(byId.get('root_end')?.inputs).toEqual(['Loading', 'Playing', 'Paused']);
    expect(byId.get('Running_start')?.inputs).toEqual(['Idle']);
    expect(data.filter(point => point.inputs?.includes('Running_start')).map(point => point.id)).toEqual(['Loading']);
  });

  it('enters a composite state that starts in a loop on its states, not its final state', () => {
    const figure = convert('stateDiagram', {
      getData: () => ({
        nodes: [
          { id: 'Idle', label: 'Idle' },
          { id: 'Running', label: 'Running', isGroup: true },
          { id: 'Playing', label: 'Playing', parentId: 'Running' },
          { id: 'Paused', label: 'Paused', parentId: 'Running' },
          { id: 'Running_end', shape: 'stateEnd', parentId: 'Running' },
        ],
        edges: [
          { start: 'Idle', end: 'Running' },
          { start: 'Playing', end: 'Paused' },
          { start: 'Paused', end: 'Playing' },
          { start: 'Paused', end: 'Running_end' },
        ],
      }),
    });

    const [, playing, paused, end] = layersOf(figure)[0].data as DirectedGraphPoint[];

    expect(playing.inputs).toEqual(['Idle', 'Paused']);
    expect(paused.inputs).toEqual(['Idle', 'Playing']);
    expect(end.inputs).toEqual(['Paused']);
  });
});

describe('a requirement diagram', () => {
  /** Rows as Mermaid 12's requirementDb holds them. */
  const checkout = { name: 'checkout_req', type: 'Requirement', requirementId: '1', text: 'Orders must be payable online.', risk: 'High', verifyMethod: 'Test' };
  const payment = { name: 'payment_req', type: 'Functional Requirement', requirementId: '1.1', text: 'Card payments must be authorised.', risk: 'Medium', verifyMethod: 'Inspection' };
  const service = { name: 'payment_service', type: 'service', docRef: 'docs/payments.md' };

  /**
   * A stand-in requirementDb.
   *
   * @param requirements - Its requirements
   * @param elements - Its elements
   * @returns The database
   */
  function requirementDb(requirements: object[], elements: object[]): object {
    const boxes = [...requirements, ...elements].map(row => ({ ...row, id: (row as { name: string }).name, shape: 'requirementBox' }));
    return {
      getRequirements: () => new Map(requirements.map(row => [(row as { name: string }).name, row])),
      getElements: () => new Map(elements.map(row => [(row as { name: string }).name, row])),
      getData: () => ({
        nodes: boxes,
        edges: [
          { start: 'checkout_req', end: 'payment_req', label: '&lt;&lt;contains&gt;&gt;' },
          ...(elements.length > 0 ? [{ start: 'payment_service', end: 'payment_req', label: '&lt;&lt;satisfies&gt;&gt;' }] : []),
        ],
      }),
    };
  }

  it('names each box for what it is, an element as an element', () => {
    const layer = layersOf(convert('requirement', requirementDb([checkout, payment], [service])))[0];

    const [checkoutReq, paymentReq, paymentService] = layer.data as DirectedGraphPoint[];

    expect(layer.axes?.x?.label).toBeUndefined();
    expect(checkoutReq.attributes).toMatchObject({ Kind: 'Requirement', ID: '1' });
    expect(paymentReq).toMatchObject({ inputs: ['checkout_req', 'payment_service'], inputLabels: ['contains', 'satisfies'] });
    expect(paymentReq.attributes).toEqual({ Kind: 'Functional Requirement', ID: '1.1', Text: 'Card payments must be authorised.', Risk: 'Medium', Verification: 'Inspection' });
    expect(paymentService.attributes).toEqual({ Kind: 'Element', Type: 'service', Document: 'docs/payments.md' });
  });

  it('calls the boxes requirements when every box is one', () => {
    const layer = layersOf(convert('requirement', requirementDb([checkout, payment], [])))[0];

    expect(layer.axes?.x?.label).toBe('Requirement');
  });
});
