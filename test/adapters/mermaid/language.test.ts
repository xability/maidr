/**
 * @jest-environment jsdom
 */

import type { MermaidApi } from '@adapters/mermaid/types';
import type { DirectedGraphPoint, GanttData, LinePoint, Maidr, ScatterPoint, SequenceData, TreemapPoint } from '@type/grammar';
import { createMaidrFromMermaid } from '@adapters/mermaid/converter';
import { parseZenUml } from '@adapters/mermaid/diagrams/zenuml';
import { sayIn } from '@adapters/mermaid/words';
import { languageRewritesSettled } from '@adapters/shared/language';
import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LANGUAGE_CHANGE_EVENT } from '@util/i18n/locale';
import { SETTINGS_KEY } from '@util/settingsKey';
import { convert, drawn, layersOf, mermaidShapeNames } from './helpers';

/**
 * The adapter's own words -- what it calls a diagram's nodes, their kinds and
 * attributes, the words for what a diagram draws rather than writes -- in the
 * language asked for, while what the author wrote stays as written.
 *
 * Stand-in databases shaped as Mermaid 12's; see `./helpers`. The English
 * words are checked by every other test of the adapter.
 */

const KO = { language: 'ko' } as const;
const DE = { language: 'de' } as const;

describe('the Mermaid adapter in another language', () => {
  it('names a kanban board\'s items, columns and cards, and a card\'s details', () => {
    const layer = layersOf(convert('kanban', {
      getData: () => ({
        nodes: [
          { id: 'todo', label: 'To do', isGroup: true },
          { id: 'docs', label: 'Write the docs', parentId: 'todo', isGroup: false, assigned: 'ana', priority: 'High' },
          { id: 'tests', label: 'Tests', parentId: 'todo', isGroup: false, priority: 'Urgent' },
        ],
      }),
    }, drawn('k'), KO))[0];

    expect(layer.axes?.x?.label).toBe('항목');
    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'To do', kind: '열' },
      { x: 'Write the docs (담당자 ana, 우선순위 높음)', path: ['To do'], kind: '카드' },
      // A priority Mermaid does not know is the author's, read as written.
      { x: 'Tests (우선순위 Urgent)', path: ['To do'], kind: '카드' },
    ]);
  });

  it('names a flowchart\'s steps and their shapes, and the attribute the shape is', () => {
    const layer = layersOf(convert('flowchart-v2', {
      getData: () => ({
        nodes: [
          { id: 'A', label: 'Order', shape: 'squareRect' },
          { id: 'B', label: 'In stock?', shape: 'diamond' },
          { id: 'C', label: 'Log', shape: 'lean_right' },
          { id: 'D', label: 'Later', shape: 'newShape' },
        ],
        edges: [{ start: 'A', end: 'B', label: 'check' }],
      }),
    }, drawn('f'), DE))[0];
    const data = layer.data as DirectedGraphPoint[];

    expect(layer.axes?.x?.label).toBe('Schritt');
    expect(data.map(point => point.attributes)).toEqual([
      undefined,
      { Form: 'Entscheidung' },
      { Form: 'Eingabe oder Ausgabe' },
      // A shape Mermaid adds later is read as its name.
      { Form: 'new shape' },
    ]);
    // What the author wrote stays as written.
    expect(data[1]).toMatchObject({ label: 'In stock?', inputLabels: ['check'] });
  });

  it('has a word for every shape Mermaid draws, under each of its names', () => {
    // Korean shares no letters with a name spelled out in English, so a
    // name the adapter has no word for shows. The plain box's names, and a
    // state's start and end, which are named in words of their own, have no
    // shape announced.
    const names = mermaidShapeNames().flat();
    const layer = layersOf(convert('flowchart-v2', {
      getData: () => ({ nodes: names.map((shape, at) => ({ id: `n${at}`, label: `Step ${at}`, shape })), edges: [] }),
    }, drawn('f'), KO))[0];

    const spelled = (layer.data as DirectedGraphPoint[])
      .map((point, at) => ({ shape: names[at], word: point.attributes?.기호 }))
      .filter(({ word }) => typeof word === 'string' && /[a-z]/i.test(word));

    expect(names.length).toBeGreaterThan(100);
    expect(spelled).toEqual([]);
  });

  it('words a class relation and its cardinalities, and names a note', () => {
    const figure = convert('classDiagram', {
      getData: () => ({
        nodes: [
          { id: 'Animal', label: 'Animal' },
          { id: 'Duck', label: 'Duck' },
          { id: 'note1', label: 'can fly', shape: 'note' },
        ],
        edges: [
          { start: 'note1', end: 'Duck' },
          { start: 'Animal', end: 'Duck', arrowTypeStart: 'extension', arrowTypeEnd: 'none', pattern: 'solid' },
        ],
      }),
      getClasses: () => new Map([
        ['Animal', { id: 'Animal', members: [{ text: '\\+int age', visibility: '+' }], methods: [], annotations: ['interface'] }],
      ]),
      getRelations: () => [{ id1: 'Animal', id2: 'Duck', relationTitle1: '1', relationTitle2: 'many' }],
    }, drawn('c'), KO);
    const [animal, duck] = layersOf(figure)[0].data as DirectedGraphPoint[];

    expect(layersOf(figure)[0].axes?.x?.label).toBe('클래스');
    // `public` is the member's visibility in the notation, not prose.
    expect(animal.attributes).toEqual({ 어노테이션: 'interface', 속성: 'public int age' });
    expect(animal).toMatchObject({ inputs: ['Duck'], inputLabels: ['상속, 다중도 many Duck 대 1 Animal'] });
    expect(duck.attributes).toEqual({ 노트: 'can fly' });
  });

  it('words an entity relationship\'s cardinality and whether it identifies', () => {
    const [, order] = layersOf(convert('er', {
      getData: () => ({
        nodes: [{ id: 'CUSTOMER' }, { id: 'ORDER' }],
        edges: [{ start: 'CUSTOMER', end: 'ORDER', label: 'places', arrowTypeStart: 'only_one', arrowTypeEnd: 'zero_or_more', pattern: 'dashed' }],
      }),
      getEntities: () => new Map(),
    }, drawn('e'), KO))[0].data as DirectedGraphPoint[];

    expect(order.inputLabels).toEqual(['places, 정확히 하나 대 0개 이상, 비식별 관계']);
  });

  it('names a state diagram\'s start, its end and its concurrent regions', () => {
    const data = layersOf(convert('stateDiagram', {
      getData: () => ({
        nodes: [
          { id: 'root_start', shape: 'stateStart' },
          { id: 'Active', label: 'Active', isGroup: true },
          { id: 'divider-1', label: '', shape: 'divider', isGroup: true, parentId: 'Active' },
          { id: 'On', label: 'On', parentId: 'divider-1' },
          { id: 'root_end', shape: 'stateEnd' },
        ],
        edges: [{ start: 'root_start', end: 'Active' }, { start: 'Active', end: 'root_end' }],
      }),
    }, drawn('s'), KO))[0].data as DirectedGraphPoint[];

    expect(data.map(point => point.label ?? point.id)).toEqual(['시작', 'On', '종료']);
    expect(data[1].path).toEqual(['Active', '영역 1']);
  });

  it('names every attribute of a requirement, and the values Mermaid knows', () => {
    const requirement = { name: 'pay', type: 'Functional Requirement', requirementId: '1', text: 'Pay online.', risk: 'High', verifyMethod: 'Test' };
    const element = { name: 'svc', type: 'service', docRef: 'docs/pay.md' };
    const db = {
      getElements: () => new Map([['svc', element]]),
      getData: () => ({
        nodes: [requirement, element].map(row => ({ ...row, id: row.name, shape: 'requirementBox' })),
        edges: [{ start: 'svc', end: 'pay', label: '&lt;&lt;satisfies&gt;&gt;' }],
      }),
    };

    const [pay, svc] = layersOf(convert('requirement', db, drawn('r'), KO))[0].data as DirectedGraphPoint[];

    expect(pay.attributes).toEqual({ '종류': '기능 요구사항', 'ID': '1', '내용': 'Pay online.', '위험도': '높음', '검증 방법': '시험' });
    // An element's type is the author's.
    expect(svc.attributes).toEqual({ 종류: '요소', 유형: 'service', 문서: 'docs/pay.md' });
    expect(pay.inputLabels).toEqual(['충족']);
  });

  it('names a railroad grammar\'s constructs, and still reads a rule that is a sequence as its parts', () => {
    const layer = layersOf(convert('railroadEbnf', {
      getRules: () => [
        {
          name: 'digits',
          definition: { type: 'repetition', min: 1, element: { type: 'nonterminal', name: 'digit' } },
        },
        {
          name: 'pair',
          definition: { type: 'sequence', elements: [{ type: 'terminal', value: '(' }, { type: 'optional', element: { type: 'terminal', value: ')' } }] },
        },
      ],
    }, drawn('rr'), KO))[0];

    expect((layer.data as TreemapPoint[]).map(point => [point.x, point.kind])).toEqual([
      ['digits', '규칙'],
      ['1회 이상 반복', '표현식'],
      ['규칙 digit', '참조'],
      ['pair', '규칙'],
      ['"("', '종단 기호'],
      ['선택 사항', '표현식'],
      ['")"', '종단 기호'],
    ]);
  });

  it('says what a C4 element is, outside the system and as a store', () => {
    const data = layersOf(convert('c4', {
      getBoundaries: () => [],
      getC4ShapeArray: () => [
        { alias: 'user', label: { text: 'User' }, typeC4Shape: { text: 'external_person' } },
        { alias: 'db', label: { text: 'Ledger' }, typeC4Shape: { text: 'external_system_db' }, techn: { text: 'Postgres' } },
        { alias: 'q', label: { text: 'Jobs' }, typeC4Shape: { text: 'container_queue' } },
        { alias: 'odd', label: { text: 'Later' }, typeC4Shape: { text: 'deployment_node' } },
      ],
      getRels: () => [],
    }, drawn('c4'), DE))[0].data as DirectedGraphPoint[];

    expect(data.map(point => point.attributes)).toEqual([
      { Typ: 'externe Person' },
      { Typ: 'externes System (Datenbank)', Technologie: 'Postgres' },
      { Typ: 'Container (Warteschlange)' },
      // A type Mermaid adds later is read as its words.
      { Typ: 'deployment node' },
    ]);
  });

  it('names a git graph\'s unnamed commits and their types', () => {
    const data = layersOf(convert('gitGraph', {
      getCommitsArray: () => [
        { id: '0-abcdef0', seq: 0, type: 0, branch: 'main', parents: [] },
        { id: '1-abcdef1', seq: 1, type: 3, branch: 'main', parents: ['0-abcdef0'] },
      ],
    }, drawn('g'), KO))[0].data as DirectedGraphPoint[];

    expect(data.map(point => point.label)).toEqual(['커밋 1', '커밋 2']);
    expect(data[1].attributes).toEqual({ 유형: '병합' });
  });

  it('words a gantt task\'s status and the chart\'s unit', () => {
    const day = (n: number): Date => new Date(Date.UTC(2024, 0, n));
    const layer = layersOf(convert('gantt', {
      getTasks: () => [{ id: 'a1', task: 'Design', section: '', startTime: day(1), endTime: day(11), done: true, crit: true }],
    }, drawn('gt'), KO))[0];
    const data = layer.data as GanttData;

    expect(data.lanes).toEqual(['작업']);
    expect(data.points[0][0].label).toBe('Design (완료, 중요)');
    expect(data.unit).toBe('일');
    expect([layer.axes?.x?.label, layer.axes?.y?.label]).toEqual(['날짜', '섹션']);
  });

  it('names a packet\'s rows, its axes and its unit', () => {
    const layer = layersOf(convert('packet', {
      getPacket: () => [[{ start: 0, end: 15, label: 'Source Port' }]],
    }, drawn('p'), DE))[0];
    const data = layer.data as GanttData;

    expect(data.points[0][0].x).toBe('Bits 0 bis 15');
    expect(data.unit).toBe('Bit');
    expect([layer.axes?.x?.label, layer.axes?.y?.label]).toEqual(['Bit', 'Zeile']);
  });

  it('names a quadrant chart\'s quadrants by corner, and joins its axis ends', () => {
    const figure = convert('quadrantChart', {
      getQuadrantData: () => ({
        quadrants: [
          { x: 50, y: 0, width: 50, height: 50, text: { text: 'Expand' } },
          { x: 0, y: 0, width: 50, height: 50, text: { text: 'Promote' } },
          { x: 0, y: 50, width: 50, height: 50, text: { text: '' } },
          { x: 50, y: 50, width: 50, height: 50, text: { text: '' } },
        ],
        points: [{ x: 75, y: 25, text: { text: 'B' } }],
        axisLabels: [{ text: 'Low' }, { text: 'High' }],
      }),
    }, drawn('q'), KO);

    expect(figure.subtitle).toBe('사분면: Expand (오른쪽 위); Promote (왼쪽 위)');
    expect(layersOf(figure)[0].axes?.x?.label).toBe('Low에서 High까지');
    // An axis with no ends declared is named by its letter.
    expect(layersOf(figure)[0].axes?.y?.label).toBe('y');
  });

  it('words a user journey\'s moods and names its axes', () => {
    const layer = layersOf(convert('journey', {
      getTasks: () => [{ section: 'Morning', task: 'Make tea', score: 5, people: ['Me'] }],
    }, drawn('j'), KO))[0];

    expect((layer.data as LinePoint[][])[0][0]).toMatchObject({ x: 'Make tea (Me)', label: '5, 만족', z: 'Morning' });
    expect([layer.axes?.x?.label, layer.axes?.y?.label, layer.axes?.z?.label]).toEqual(['작업', '점수', '섹션']);
  });

  it('names a Wardley map\'s layers, axes and attributes, its notes kept in parentheses', () => {
    const [map, chain] = layersOf(convert('wardley', {
      getWardleyData: () => ({
        nodes: [{ id: 'User', label: 'User', x: 50, y: 95, className: 'anchor' }, { id: 'Tea', label: 'Tea', x: 80, y: 60, inertia: true }],
        links: [{ source: 'User', target: 'Tea', dashed: true }],
        trends: [{ nodeId: 'Tea', targetX: 90 }],
      }),
    }, drawn('w'), KO));

    expect(map.name).toBe('구성 요소');
    expect([map.axes?.x?.label, map.axes?.y?.label]).toEqual(['진화', '가시성']);
    // The parentheses are how a layer switch tells a note from the name.
    expect((map.data as ScatterPoint[]).map(point => point.label)).toEqual(['User (앵커)', 'Tea (관성, 0.9로 진화 중)']);
    expect(chain.name).toBe('가치 사슬');
    expect(chain.axes?.x?.label).toBe('구성 요소');
    expect((chain.data as DirectedGraphPoint[])[1]).toMatchObject({
      attributes: { 진화: 0.8, 가시성: 0.6 },
      inputLabels: ['점선'],
    });
  });

  it('names the Cynefin layers, and keeps the ids every language shares', () => {
    const db = {
      getDomains: () => [{ name: 'complex', items: [{ label: 'Pilot' }] }, { name: 'clear', items: [] }],
      getTransitions: () => [{ from: 'complex', to: 'clear', label: 'Stabilised' }],
    };

    const english = layersOf(convert('cynefin', db, drawn('cy')));
    const korean = layersOf(convert('cynefin', db, drawn('cy'), KO));

    expect(korean.map(layer => layer.name)).toEqual(['영역', '전환']);
    expect(korean.map(layer => layer.id)).toEqual(english.map(layer => layer.id));
    expect((korean[0].data as TreemapPoint[]).map(point => point.kind)).toEqual(['영역', '항목', '영역']);
  });

  it('says what a sequence participant is drawn as, and keeps the fragments\' keywords', () => {
    const data = layersOf(convert('sequence', {
      getActorKeys: () => ['B', 'S', 'D'],
      getActors: () => new Map([
        ['B', { description: 'Browser', type: 'actor' }],
        ['S', { description: 'Server', type: 'participant' }],
        ['D', { description: 'Store', type: 'database' }],
      ]),
      getMessages: () => [
        { id: '0', type: 10, message: 'retry' },
        { id: '1', type: 0, from: 'B', to: 'S', message: 'GET /' },
        { id: '2', type: 11, message: '' },
      ],
    }, drawn('sq'), KO))[0].data as SequenceData;

    expect(data.participants).toEqual([
      { id: 'B', label: 'Browser', kind: '액터' },
      { id: 'S', label: 'Server' },
      { id: 'D', label: 'Store', kind: '데이터베이스' },
    ]);
    // `loop` is the notation's, as the drawing writes it.
    expect(data.messages[0].fragments).toEqual(['loop retry']);
  });

  it('names ZenUML\'s starter and what a participant is drawn as', () => {
    const { participants } = parseZenUml('zenuml\n@Actor Alice\nAlice->Bob.hello()\nBob.ping()', sayIn('ko'));

    expect(participants).toEqual([
      { id: '_STARTER_', label: '시작점' },
      { id: 'Alice', kind: '액터' },
      { id: 'Bob' },
    ]);
  });

  it('names a node of a hierarchy that has no name', () => {
    const layer = layersOf(convert('mindmap', {
      getMindmap: () => ({ descr: 'Root', children: [{ descr: '' }] }),
    }, drawn('m'), KO))[0];

    expect(layer.axes?.x?.label).toBe('주제');
    expect((layer.data as TreemapPoint[]).map(point => point.x)).toEqual(['Root', '(이름 없음)']);
  });
});

describe('the language the Mermaid adapter writes in', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  afterEach(() => {
    localStorage.clear();
    warn.mockClear();
  });

  afterAll(() => {
    warn.mockRestore();
  });

  it('is the one the reader chose in MAIDR\'s settings, when none is asked for', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ general: { language: 'ja' } }));

    const layer = layersOf(convert('mindmap', { getMindmap: () => ({ descr: 'Root' }) }))[0];

    expect(layer.axes?.x?.label).toBe('テーマ');
  });

  it('is the one asked for over the reader\'s', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ general: { language: 'ja' } }));

    const layer = layersOf(convert('mindmap', { getMindmap: () => ({ descr: 'Root' }) }, drawn('m'), KO))[0];

    expect(layer.axes?.x?.label).toBe('주제');
  });

  it('is the reader\'s when the one asked for is not a language MAIDR speaks, with a warning', () => {
    const layer = layersOf(convert('mindmap', { getMindmap: () => ({ descr: 'Root' }) }, drawn('m'), {
      language: 'pt' as 'ko',
    }))[0];

    expect(layer.axes?.x?.label).toBe('Topic');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Ignoring language "pt"'));
  });
});

describe('a Mermaid diagram the reader changes language on', () => {
  /** `window.maidrLive`, as far as the adapter uses it. */
  let setData: jest.Mock<(maidr: Maidr) => boolean>;

  /** A pie of two slices, which Mermaid parses into this database. */
  const PIE: MermaidApi = {
    mermaidAPI: {
      getDiagramFromText: async () => ({ type: 'pie', db: { getSections: () => new Map([['Dogs', 3], ['Cats', 2]]) } }),
    },
    render: async () => ({ svg: '' }),
  };

  /**
   * Binds the pie as the binding helpers do: converted, and the figure set
   * on the drawing for MAIDR to read.
   *
   * @param options - Figure options
   * @param options.language - A language of its own, if given one
   * @returns The drawing
   */
  async function bind(options: { language?: 'de' } = {}): Promise<SVGSVGElement> {
    const svg = drawn('pie', '<path class="pieCircle"></path><path class="pieCircle"></path>');
    svg.setAttribute('maidr', JSON.stringify(await createMaidrFromMermaid(PIE, 'pie', svg, options)));
    return svg;
  }

  /**
   * Tells the page MAIDR now speaks a language, as the core does, and waits
   * for the adapter to write its words again.
   *
   * @param language - The language
   */
  async function speak(language: string): Promise<void> {
    document.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: { language } }));
    await languageRewritesSettled();
  }

  beforeEach(() => {
    setData = jest.fn<(maidr: Maidr) => boolean>(() => true);
    (window as unknown as { maidrLive?: unknown }).maidrLive = { setData };
  });

  afterEach(async () => {
    await speak('en');
    document.body.innerHTML = '';
    delete (window as unknown as { maidrLive?: unknown }).maidrLive;
  });

  it('is converted again in the new language and handed to MAIDR, outlined as before', async () => {
    const svg = await bind();
    // MAIDR's copy of the slice the reader is on, beside it, as it is while
    // MAIDR shows the diagram: counted as a slice, the pie would no longer
    // pair one for one with the drawing, and lose its outline.
    const copy = svg.querySelector('path.pieCircle')?.cloneNode() as Element;
    copy.setAttribute('data-maidr-owned', 'true');
    svg.querySelector('path.pieCircle')?.after(copy);

    await speak('ko');

    expect(setData).toHaveBeenCalledTimes(1);
    const [layer] = layersOf(setData.mock.calls[0][0]);
    expect(layer.axes).toEqual({ x: { label: '섹션' }, y: { label: '값' } });
    expect(layer.selectors).toBe('#pie path.pieCircle');
  });

  it('keeps a language it was given', async () => {
    const svg = await bind({ language: 'de' });

    await speak('ko');

    expect(setData).not.toHaveBeenCalled();
    expect(layersOf(JSON.parse(svg.getAttribute('maidr') ?? '{}'))[0].axes?.x?.label).toBe('Abschnitt');
  });
});
