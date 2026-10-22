/**
 * @jest-environment jsdom
 */

import { sourceOf } from '@adapters/mermaid/bind';
import { createMaidrFromMermaid, frontMatterTitle, supportedMermaidDiagrams } from '@adapters/mermaid/converter';
import { plain } from '@adapters/mermaid/read';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { convert, drawn, layersOf } from './helpers';

/**
 * The Mermaid adapter's converter: the types it reads, titles, the page source and labels.
 *
 * Stand-in databases shaped as Mermaid 12's; see `./helpers`.
 */

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

  it('reads a diagram with nothing in it as a figure MAIDR announces as empty', () => {
    const figure = convert('pie', { getSections: () => new Map(), getDiagramTitle: () => 'Pets' });

    expect(figure.title).toBe('Pets');
    expect(figure.subplots).toEqual([[{ layers: [] }]]);
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

  it('reads the title and description a timeline keeps in Mermaid\'s common database', () => {
    const figure = convert('timeline', {
      getSections: () => [],
      getTasks: () => [{ task: '2002', events: [] }],
      getCommonDb: () => ({ getDiagramTitle: () => 'Milestones', getAccDescription: () => 'Two strands' }),
    });
    expect(figure.title).toBe('Milestones');
    expect(figure.caption).toBe('Two strands');
  });

  it('prefers the database\'s own title to the common database\'s', () => {
    const figure = convert('pie', {
      getSections: () => new Map([['Dogs', 3]]),
      getDiagramTitle: () => 'Own',
      getCommonDb: () => ({ getDiagramTitle: () => 'Common' }),
    });
    expect(figure.title).toBe('Own');
  });

  it('reads no title from a common database that is missing or throws', () => {
    for (const getCommonDb of [() => null, () => {
      throw new Error('moved on');
    }]) {
      const figure = convert('timeline', { getSections: () => [], getTasks: () => [{ task: '2002' }], getCommonDb });
      expect(figure.title).toBeUndefined();
      expect(figure.caption).toBeUndefined();
    }
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
    // Markup nested to survive a single pass of a tag pattern is still taken out.
    expect(plain('<scr<b>ipt>alert(1)</scr</b>ipt>')).not.toMatch(/<script/i);
  });
});
