import { sourceOf } from '@adapters/mermaid/bind';
import { frontMatterTitle } from '@adapters/mermaid/converter';
import { describe, expect, it } from '@jest/globals';

/**
 * A diagram's source as `renderMermaid` takes it from the page (#1418).
 *
 * Authors indent a diagram to sit inside its markup, and Mermaid's own
 * `run()` dedents it before parsing. Front matter is the part that breaks
 * when that is skipped: a `---` fence that does not start its line is not a
 * fence, so the title and config are read as diagram text.
 */
describe('the source of an indented diagram', () => {
  it('drops the indentation every line shares, keeping the nesting below it', () => {
    const text = '\n    flowchart LR\n      A --> B\n      B --> C\n  ';

    const source = sourceOf(text);

    expect(source).toBe('flowchart LR\n  A --> B\n  B --> C');
  });

  it('does not let a blank or whitespace-only line set the shared indentation', () => {
    const text = '\n      pie\n\n  \n        "Dogs" : 3\n    ';

    const source = sourceOf(text);

    expect(source).toBe('pie\n\n\n  "Dogs" : 3');
  });

  it('leaves a diagram that is not indented as written', () => {
    const text = 'sequenceDiagram\n  A->>B: hi';

    const source = sourceOf(text);

    expect(source).toBe(text);
  });

  it('reads Windows line endings as plain ones', () => {
    const text = '\r\n  pie\r\n    "Dogs" : 3\r\n';

    const source = sourceOf(text);

    expect(source).toBe('pie\n  "Dogs" : 3');
  });

  it('is empty for an element with no text', () => {
    expect(sourceOf('')).toBe('');
    expect(sourceOf('\n   \n')).toBe('');
  });
});

describe('the source of a diagram with front matter', () => {
  it('puts an indented fence back at the start of its line, so the title is found', () => {
    const text = '\n        ---\n        title: Release plan\n        ---\n        gantt\n          task : a1, 2024-01-01, 3d\n      ';

    const source = sourceOf(text);

    expect(source.startsWith('---\ntitle: Release plan\n---\ngantt\n')).toBe(true);
    expect(frontMatterTitle(source)).toBe('Release plan');
  });

  it('keeps the nesting inside the front matter, so its config still parses', () => {
    const text = '\n    ---\n    config:\n      theme: base\n    title: "Quoted"\n    ---\n    pie\n  ';

    const source = sourceOf(text);

    expect(source).toBe('---\nconfig:\n  theme: base\ntitle: "Quoted"\n---\npie');
    expect(frontMatterTitle(source)).toBe('Quoted');
  });

  it('dedents by the least indented line, so a fence written further left wins', () => {
    const text = '  ---\n  title: Pets\n  ---\n      pie\n        "Dogs" : 3';

    const source = sourceOf(text);

    expect(source).toBe('---\ntitle: Pets\n---\n    pie\n      "Dogs" : 3');
    expect(frontMatterTitle(source)).toBe('Pets');
  });
});
