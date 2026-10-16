/**
 * @jest-environment jsdom
 */

/**
 * The Mermaid and Graphviz entries start watching by themselves on a page
 * Quarto rendered, and only there, unless the page opts out first.
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';

const mockWatchQuartoMermaid = jest.fn(() => () => {});
const mockWatchGraphviz = jest.fn(() => () => {});

jest.mock('../../src/adapters/mermaid/quarto', () => ({ watchQuartoMermaid: mockWatchQuartoMermaid }));
jest.mock('../../src/adapters/graphviz/watch', () => ({ watchGraphviz: mockWatchGraphviz }));

type Page = Window & Record<string, unknown>;

const ENTRIES: Array<[string, string, jest.Mock, string]> = [
  ['mermaid', '../../src/mermaid-entry', mockWatchQuartoMermaid, 'maidrMermaidAutoInit'],
  ['graphviz', '../../src/graphviz-entry', mockWatchGraphviz, 'maidrGraphvizAutoInit'],
];

/**
 * Loads an entry afresh into the current page.
 *
 * @param entry - The entry module
 */
function load(entry: string): void {
  jest.isolateModules(() => {
    // eslint-disable-next-line ts/no-require-imports -- a fresh load per page
    require(entry);
  });
}

describe.each(ENTRIES)('the %s entry', (_name, entry, watch, optOut) => {
  afterEach(() => {
    watch.mockClear();
    document.head.innerHTML = '';
    const page = window as unknown as Page;
    for (const key of Object.keys(page).filter(key => key.startsWith('maidr'))) {
      delete page[key];
    }
  });

  it('starts watching on a page Quarto rendered', () => {
    document.head.innerHTML = '<meta name="generator" content="quarto-1.10.19">';

    load(entry);

    expect(watch).toHaveBeenCalledTimes(1);
  });

  it('starts once when loaded twice', () => {
    document.head.innerHTML = '<meta name="generator" content="quarto-1.10.19">';

    load(entry);
    load(entry);

    expect(watch).toHaveBeenCalledTimes(1);
  });

  it('leaves any other page alone', () => {
    document.head.innerHTML = '<meta name="generator" content="pandoc">';

    load(entry);

    expect(watch).not.toHaveBeenCalled();
  });

  it('leaves a Quarto page alone when it opts out', () => {
    document.head.innerHTML = '<meta name="generator" content="quarto-1.10.19">';
    (window as unknown as Page)[optOut] = false;

    load(entry);

    expect(watch).not.toHaveBeenCalled();
  });
});
