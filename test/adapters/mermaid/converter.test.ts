/**
 * @jest-environment jsdom
 */

import type {
  DirectedGraphPoint,
  GanttData,
  LinePoint,
  Maidr,
  MaidrLayer,
  PiePoint,
  ScatterPoint,
  SequenceData,
  TreemapPoint,
  VennPoint,
} from '@type/grammar';
import { sourceOf } from '@adapters/mermaid/bind';
import { convertMermaidDiagram, createMaidrFromMermaid, frontMatterTitle, supportedMermaidDiagrams } from '@adapters/mermaid/converter';
import { plain } from '@adapters/mermaid/read';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

/**
 * The Mermaid adapter, against stand-in databases shaped as Mermaid 12's.
 *
 * Mermaid itself does not load under jsdom, so each test hands the converter
 * the database a parse would have produced -- the getters it reads and
 * nothing else -- and an SVG holding the elements Mermaid draws with the ids
 * and classes it gives them. The e2e spec runs the real Mermaid.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Builds a rendered diagram: an SVG with the given id holding the markup.
 *
 * @param id - The SVG's id, which Mermaid prefixes its element ids with
 * @param markup - The SVG's contents
 * @returns The SVG, attached to the document
 */
function drawn(id: string, markup = ''): SVGSVGElement {
  document.body.innerHTML = '';
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.id = id;
  svg.innerHTML = markup;
  document.body.appendChild(svg);
  return svg;
}

/**
 * Converts a stand-in database and returns the figure.
 *
 * @param type - The diagram type
 * @param db - The database
 * @param svg - The drawing
 * @returns The figure
 */
function convert(type: string, db: object, svg: SVGSVGElement = drawn('d')): Maidr {
  return convertMermaidDiagram({ type, db }, svg);
}

/**
 * The figure's layers.
 *
 * @param figure - The figure
 * @returns Its first subplot's layers
 */
function layersOf(figure: Maidr): MaidrLayer[] {
  return figure.subplots[0][0].layers;
}

/**
 * How many elements a layer's selectors match.
 *
 * @param layer - The layer
 * @returns The match count
 */
function matched(layer: MaidrLayer): number {
  const selectors = layer.selectors;
  if (typeof selectors === 'string') {
    return document.querySelectorAll(selectors).length;
  }
  return (selectors as string[] ?? []).flatMap(one => [...document.querySelectorAll(one)]).length;
}

describe('the converter', () => {
  it('names every diagram type Mermaid 12 draws', () => {
    expect(supportedMermaidDiagrams()).toEqual(expect.arrayContaining([
      'flowchart-v2',
      'sequence',
      'classDiagram',
      'stateDiagram',
      'er',
      'journey',
      'gantt',
      'pie',
      'quadrantChart',
      'requirement',
      'gitGraph',
      'c4',
      'mindmap',
      'timeline',
      'sankey',
      'xychart',
      'block',
      'packet',
      'kanban',
      'architecture',
      'radar',
      'treemap',
      'venn',
      'ishikawa',
      'treeView',
      'wardley',
      'cynefin',
      'railroadEbnf',
      'eventmodeling',
      'usecase',
      'swimlane',
      'agentflow',
      'zenuml',
    ]));
  });

  it('rejects a type it does not read, naming the ones it does', () => {
    expect(() => convert('mystery', {})).toThrow(/not supported.*flowchart-v2/);
  });

  it('rejects a diagram with nothing in it rather than an empty figure', () => {
    expect(() => convert('pie', { getSections: () => new Map() })).toThrow(/nothing MAIDR can read/);
  });

  it('takes the title and description the diagram declares', () => {
    const figure = convert('pie', {
      getSections: () => new Map([['Dogs', 3]]),
      getDiagramTitle: () => 'Pets',
      getAccDescription: () => 'Adopted this year',
    });
    expect(figure.title).toBe('Pets');
    expect(figure.caption).toBe('Adopted this year');
  });

  it('reads a front matter title, which Mermaid keeps out of the database', () => {
    expect(frontMatterTitle('---\ntitle: Animal example\n---\nclassDiagram\n')).toBe('Animal example');
    expect(frontMatterTitle('---\nconfig:\n  theme: base\ntitle: "Quoted"\n---\npie\n')).toBe('Quoted');
    expect(frontMatterTitle('pie title Pets\n')).toBeUndefined();
  });

  it('parses the text with Mermaid\'s own parser', async () => {
    const svg = drawn('p');
    const figure = await createMaidrFromMermaid({
      mermaidAPI: {
        getDiagramFromText: async () => ({ type: 'pie', db: { getSections: () => new Map([['A', 1]]) } }),
      },
      render: async () => ({ svg: '' }),
    }, '---\ntitle: From front matter\n---\npie\n', svg);
    expect(figure.title).toBe('From front matter');
    expect(layersOf(figure)[0].type).toBe(TraceType.PIE);
  });

  it('survives a getter that throws, reading the diagram without it', () => {
    const figure = convert('pie', {
      getSections: () => new Map([['A', 1]]),
      getDiagramTitle: () => {
        throw new Error('moved on');
      },
    });
    expect(figure.title).toBeUndefined();
  });
});

describe('the source of a diagram on the page', () => {
  it('is dedented and trimmed, as Mermaid\'s run() reads it, so front matter still parses', () => {
    expect(sourceOf('\n      ---\n      title: Pets\n      ---\n      pie\n        "Dogs" : 3\n    ')).toBe('---\ntitle: Pets\n---\npie\n  "Dogs" : 3');
  });
});

describe('labels', () => {
  it('are read as a reader should hear them', () => {
    expect(plain('can fly<br>can swim')).toBe('can fly can swim');
    expect(plain('&lt;&lt;satisfies&gt;&gt;')).toBe('<<satisfies>>');
    expect(plain('I #9829; you')).toBe('I ♥ you');
    expect(plain('**bold** and `code`')).toBe('bold and code');
    expect(plain({ text: 'C4 wraps labels' })).toBe('C4 wraps labels');
    expect(plain(undefined)).toBe('');
  });
});

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

describe('a sequence diagram', () => {
  const db = {
    getActorKeys: () => ['B', 'S'],
    getActors: () => new Map([
      ['B', { description: 'Browser', type: 'actor' }],
      ['S', { description: 'Server', type: 'participant' }],
    ]),
    getBoxes: () => [{ name: 'Front', actorKeys: ['B'] }],
    getCreatedActors: () => new Map(),
    getDestroyedActors: () => new Map(),
    showSequenceNumbers: () => true,
    getMessages: () => [
      { id: '0', type: 0, from: 'B', to: 'S', message: 'GET /' },
      { id: '1', type: 12, message: 'cached' },
      { id: '2', type: 1, from: 'S', to: 'B', message: '304' },
      { id: '3', type: 13, message: 'fresh' },
      { id: '4', type: 1, from: 'S', to: 'B', message: '200' },
      { id: '5', type: 14, message: '' },
      { id: '6', type: 17, from: 'S', message: '' },
      { id: '7', type: 2, from: 'S', to: 'S', message: 'log it' },
      { id: '8', type: 5, from: 'B', to: 'S', message: 'ping' },
    ],
  };
  const markup = `${['0', '2', '4', '8']
    .map(id => `<line data-et="message" data-id="i${id}"></line>`)
    .join('')
  }<g data-et="note" data-id="i7"></g>`;

  it('reads participants, kinds, fragments and sequence numbers', () => {
    const layer = layersOf(convert('sequence', db, drawn('s', markup)))[0];
    const data = layer.data as SequenceData;
    expect(layer.type).toBe(TraceType.SEQUENCE);
    expect(data.participants).toEqual([
      { id: 'B', label: 'Browser', kind: 'actor', group: 'Front' },
      { id: 'S', label: 'Server' },
    ]);
    expect(data.messages).toEqual([
      { from: 'B', to: 'S', text: 'GET /', kind: 'sync', number: 1 },
      { from: 'S', to: 'B', text: '304', kind: 'reply', fragments: ['alt cached'], number: 2 },
      { from: 'S', to: 'B', text: '200', kind: 'reply', fragments: ['alt, else fresh'], number: 3 },
      { from: 'S', to: 'S', text: 'log it', kind: 'note' },
      { from: 'B', to: 'S', text: 'ping', kind: 'async', number: 4 },
    ]);
  });

  it('pairs every message and note with its drawing', () => {
    const layer = layersOf(convert('sequence', db, drawn('s', markup)))[0];
    expect(matched(layer)).toBe(5);
  });
});

describe('a Venn diagram', () => {
  it('names sets by their labels and drops the sizes Mermaid made up', () => {
    const figure = convert('venn', {
      getSubsetData: () => [
        { sets: ['A'], size: 10, label: 'Frontend' },
        { sets: ['B'], size: 10, label: 'Backend' },
        { sets: ['A', 'B'], size: 2.5, label: 'Shared' },
      ],
      getTextData: () => [{ sets: ['A', 'B'], id: 'AB1', label: 'OpenAPI' }],
    }, drawn('v', '<g class="venn-area" data-venn-sets="A"></g><g class="venn-area" data-venn-sets="B"></g><g class="venn-area" data-venn-sets="A_B"></g>'));
    const layer = layersOf(figure)[0];
    expect(layer.data as VennPoint[]).toEqual([
      { sets: ['Frontend'] },
      { sets: ['Backend'] },
      { sets: ['Frontend', 'Backend'], label: 'Shared', items: ['OpenAPI'] },
    ]);
    expect(matched(layer)).toBe(3);
  });

  it('keeps the sizes an author wrote', () => {
    const data = layersOf(convert('venn', {
      getSubsetData: () => [{ sets: ['A'], size: 20 }, { sets: ['B'], size: 10 }, { sets: ['A', 'B'], size: 3 }],
    }))[0].data as VennPoint[];
    expect(data.map(point => point.size)).toEqual([20, 10, 3]);
  });
});

describe('the charts', () => {
  it('reads a pie, outlining slices only when every one was drawn', () => {
    const svg = drawn('pie', '<path class="pieCircle"></path><path class="pieCircle"></path>');
    const layer = layersOf(convert('pie', { getSections: () => new Map([['Dogs', 386], ['Cats', 85]]) }, svg))[0];
    expect(layer.data as PiePoint[]).toEqual([{ x: 'Dogs', y: 386 }, { x: 'Cats', y: 85 }]);
    expect(layer.selectors).toBe('#pie path.pieCircle');
    const tiny = layersOf(convert('pie', { getSections: () => new Map([['Dogs', 386], ['Cats', 85], ['Rats', 1]]) }, svg))[0];
    expect(tiny.selectors).toBeUndefined();
  });

  it('reads a gantt as days per section, with each task\'s status', () => {
    const day = (n: number): Date => new Date(Date.UTC(2024, 0, n));
    const layer = layersOf(convert('gantt', {
      getTasks: () => [
        { id: 'a1', task: 'Design ', section: 'Plan', startTime: day(1), endTime: day(11), done: true },
        { id: 'a2', task: 'Build', section: 'Make', startTime: day(11), endTime: day(31), crit: true },
      ],
    }, drawn('g', '<rect id="g-a1"></rect><rect id="g-a2"></rect>')))[0];
    const data = layer.data as GanttData;
    expect(data.lanes).toEqual(['Plan', 'Make']);
    expect(data.unit).toBe('days');
    expect(data.points[0][0]).toMatchObject({ x: 'Plan', label: 'Design (done)' });
    expect(data.points[0][0].end - data.points[0][0].start).toBe(10);
    expect(data.points[1][0].label).toBe('Build (critical)');
    expect(matched(layer)).toBe(2);
  });

  it('reads a packet as bit intervals, one lane per row', () => {
    const layer = layersOf(convert('packet', {
      getPacket: () => [[{ start: 0, end: 15, label: 'Source Port' }, { start: 16, end: 31, label: 'Destination Port' }]],
    }))[0];
    expect((layer.data as GanttData).points[0]).toEqual([
      { x: 'Bits 0 to 31', start: 0, end: 16, label: 'Source Port' },
      { x: 'Bits 0 to 31', start: 16, end: 32, label: 'Destination Port' },
    ]);
  });

  it('recovers a quadrant chart\'s values from its laid-out points, in declared order', () => {
    const layer = layersOf(convert('quadrantChart', {
      getQuadrantData: () => ({
        quadrants: [
          { x: 50, y: 0, width: 50, height: 50, text: { text: 'Expand' } },
          { x: 0, y: 0, width: 50, height: 50, text: { text: 'Promote' } },
          { x: 0, y: 50, width: 50, height: 50, text: { text: '' } },
          { x: 50, y: 50, width: 50, height: 50, text: { text: '' } },
        ],
        // Mermaid prepends each point it is given.
        points: [{ x: 75, y: 25, text: { text: 'B' } }, { x: 10, y: 90, text: { text: 'A' } }],
        axisLabels: [{ text: 'Low' }, { text: 'High' }, { text: 'Bottom' }, { text: 'Top' }],
      }),
    }))[0];
    expect(layer.data as ScatterPoint[]).toEqual([{ x: 0.1, y: 0.1, label: 'A' }, { x: 0.75, y: 0.75, label: 'B' }]);
    expect(layer.axes?.x?.label).toBe('Low to High');
    expect(layer.title).toBe('Quadrants: Expand (top right); Promote (top left)');
  });

  it('reads an XY chart as one layer per plot', () => {
    const layers = layersOf(convert('xychart', {
      getXYChartData: () => ({
        xAxis: { type: 'band', categories: ['jan', 'feb'] },
        yAxis: { title: 'Revenue' },
        plots: [
          { type: 'bar', data: [['jan', 5], ['feb', 6]] },
          { type: 'line', data: [['jan', 5], ['feb', 6]] },
        ],
      }),
    }));
    expect(layers.map(layer => layer.type)).toEqual([TraceType.BAR, TraceType.LINE]);
    expect(layers[0].axes?.x?.label).toBe('Category');
    expect((layers[1].data as LinePoint[][])[0]).toEqual([{ x: 'jan', y: 5 }, { x: 'feb', y: 6 }]);
  });

  it('reads a journey as scores per section, with who takes part', () => {
    const layer = layersOf(convert('journey', {
      getTasks: () => [{ section: 'Go to work', task: 'Make tea', score: 5, people: ['Me'] }],
    }))[0];
    expect((layer.data as LinePoint[][])[0][0]).toEqual({ x: 'Make tea (Me)', y: 5, z: 'Go to work', label: '5, happy' });
  });

  it('reads a treemap\'s sections and sized items', () => {
    const layer = layersOf(convert('treemap', {
      getRoot: () => ({ name: '', children: [{ name: 'A', children: [{ name: 'A1', value: 10 }] }] }),
    }))[0];
    expect(layer.type).toBe(TraceType.TREEMAP);
    expect(layer.data as TreemapPoint[]).toEqual([{ x: 'A' }, { x: 'A1', path: ['A'], y: 10 }]);
  });
});

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

describe('the other graphs', () => {
  it('reads a git graph\'s commits by their messages and parents', () => {
    const data = layersOf(convert('gitGraph', {
      getCommitsArray: () => [
        { id: 'init', seq: 0, type: 0, parents: [], branch: 'main', tags: [] },
        { id: '1-abcdef0', seq: 1, type: 0, parents: ['init'], branch: 'dev', tags: ['v1'], message: '' },
        { id: '2-1234567', seq: 2, type: 3, parents: ['init', '1-abcdef0'], branch: 'main', tags: [], message: 'merged branch dev into main' },
      ],
    }))[0].data as DirectedGraphPoint[];
    expect(data.map(point => point.label ?? point.id)).toEqual(['init', 'commit 2', 'merged branch dev into main']);
    expect(data[1]).toMatchObject({ path: ['dev'], attributes: { Tags: 'v1' } });
    expect(data[2]).toMatchObject({ inputs: ['init', '1-abcdef0'], attributes: { Type: 'merge' } });
  });

  it('reads C4 elements in their boundaries, a two-way relationship both ways', () => {
    const data = layersOf(convert('c4', {
      getBoundaries: (parent: string) => (parent === 'global' ? [{ alias: 'b0', label: { text: 'Bank' }, type: { text: 'ENTERPRISE' } }] : []),
      getC4ShapeArray: () => [
        { alias: 'user', label: { text: 'User' }, typeC4Shape: { text: 'person' }, parentBoundary: 'b0' },
        { alias: 'app', label: { text: 'App' }, typeC4Shape: { text: 'external_system' }, techn: { text: 'Java' } },
      ],
      getRels: () => [{ type: 'birel', from: 'user', to: 'app', label: { text: 'Uses' }, techn: { text: 'HTTPS' } }],
    }))[0].data as DirectedGraphPoint[];
    expect(data[0]).toMatchObject({ label: 'User', path: ['Bank (enterprise)'], inputs: ['app'], inputLabels: ['Uses [HTTPS]'] });
    expect(data[1]).toMatchObject({ attributes: { Type: 'external system', Technology: 'Java' }, inputs: ['user'] });
  });

  it('reads an architecture connection the way its arrow points', () => {
    const data = layersOf(convert('architecture', {
      getGroups: () => [{ id: 'api', title: 'API' }],
      getServices: () => [{ id: 'db', title: 'Database', in: 'api', icon: 'database' }, { id: 'web', title: 'Web' }],
      getJunctions: () => [],
      getEdges: () => [{ lhsId: 'db', rhsId: 'web', lhsInto: true, rhsInto: false }],
    }))[0].data as DirectedGraphPoint[];
    expect(data[0]).toMatchObject({ label: 'Database', path: ['API'], inputs: ['web'] });
  });

  it('reads a Wardley map as its components and their value chain', () => {
    const layers = layersOf(convert('wardley', {
      getWardleyData: () => ({
        nodes: [{ id: 'User', label: 'User', x: 50, y: 95, className: 'anchor' }, { id: 'Tea', label: 'Tea', x: 80, y: 60 }],
        links: [{ source: 'User', target: 'Tea' }],
        trends: [{ nodeId: 'Tea', targetX: 90 }],
      }),
    }));
    expect(layers.map(layer => layer.type)).toEqual([TraceType.SCATTER, TraceType.DIRECTED_GRAPH]);
    expect(layers[0].data as ScatterPoint[]).toEqual([
      { x: 0.5, y: 0.95, label: 'User, anchor' },
      { x: 0.8, y: 0.6, label: 'Tea, evolving to 0.9' },
    ]);
  });
});

describe('a ZenUML diagram', () => {
  /** A booking: a sync call with a nested call, an alternative and a reply. */
  const TEXT = `zenuml
    title Booking
    // a comment is not a message
    @Actor Customer
    S as "Seat store"
    Customer->API.book(seat) {
      available = S.check(seat)
      if(available) {
        new Ticket(seat)
        return confirmation
      } else {
        return "sold out"
      }
    }
    @return
    API->Customer: receipt`;

  it('reads participants, nesting, fragments and replies from the text', () => {
    const figure = convertMermaidDiagram({ type: 'zenuml', db: {}, text: TEXT }, drawn('z'));
    const data = layersOf(figure)[0].data as SequenceData;
    expect(figure.title).toBe('Booking');
    expect(data.participants).toEqual([
      { id: 'Customer', kind: 'actor' },
      { id: 'S', label: 'Seat store' },
      { id: 'API' },
      { id: 'Ticket' },
    ]);
    expect(data.messages).toEqual([
      { from: 'Customer', to: 'API', text: 'book(seat)', kind: 'sync' },
      { from: 'API', to: 'S', text: 'check(seat)', kind: 'sync' },
      { from: 'S', to: 'API', text: 'available', kind: 'reply' },
      { from: 'API', to: 'Ticket', text: 'new Ticket(seat)', kind: 'create', fragments: ['alt available'] },
      { from: 'API', to: 'Customer', text: 'confirmation', kind: 'reply', fragments: ['alt available'] },
      { from: 'API', to: 'Customer', text: 'sold out', kind: 'reply', fragments: ['alt, else'] },
      { from: 'API', to: 'Customer', text: 'receipt', kind: 'reply' },
    ]);
  });

  it('sends a top-level call from the starter, and names a loop and a try', () => {
    const data = layersOf(convertMermaidDiagram({
      type: 'zenuml',
      db: {},
      text: 'zenuml\n  A.load()\n  while(more) {\n    A->B: next\n  }\n  try {\n    B.save()\n  } catch {\n    B->A: failed\n  }',
    }, drawn('z')))[0].data as SequenceData;
    expect(data.participants[0]).toEqual({ id: '_STARTER_', label: 'Starter' });
    expect(data.messages.map(message => [message.from, message.to, message.fragments ?? []])).toEqual([
      ['_STARTER_', 'A', []],
      ['A', 'B', ['loop more']],
      ['_STARTER_', 'B', ['try']],
      ['B', 'A', ['try, catch']],
    ]);
  });

  it('pairs each message and reply with the group the plugin drew for it', () => {
    const svg = drawn('z', '<g class="message"></g><g class="message"></g><g class="return"></g>');
    const layer = layersOf(convertMermaidDiagram({ type: 'zenuml', db: {}, text: 'zenuml\n  x = A.get()\n  A->B: hi' }, svg))[0];
    expect(matched(layer)).toBe(3);
  });
});
