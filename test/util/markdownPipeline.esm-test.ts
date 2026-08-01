import type { Element, Nodes, Root } from 'hast';
import { describe, expect, it } from '@jest/globals';
import { createChatSanitizeSchema } from '@util/markdownSanitize';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

/**
 * The sanitisation schema, checked against `rehype-sanitize` applying it.
 *
 * `test/util/markdownSanitize.test.ts` checks what the schema *contains* —
 * every element KaTeX emits is named, attributes use hast property names, no
 * key beyond `tagNames`/`attributes` is declared. None of that is the same as
 * markup surviving, which is the property the schema exists for. The
 * difference has bitten twice: an allowlist can name `table` while a table
 * still arrives as a run of digits, and it can name an attribute under a
 * spelling nothing matches.
 *
 * These run in the `esm` Jest project because the whole chain is ESM-only;
 * see `jest.config.ts`.
 *
 * Assertions are on the hast tree rather than on serialised HTML. That is not
 * only to avoid adding `rehype-stringify` as a dependency — `react-markdown`
 * renders the tree to React elements and never produces an HTML string, so
 * the tree is the last thing that actually exists on the real path.
 */

/** The plugin chain `TypingEffect` renders with, stopped at the tree. */
async function render(markdown: string): Promise<Root> {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype)
    // Before rehypeSanitize, so KaTeX's own markup goes through the allowlist
    // rather than around it — the order TypingEffect uses.
    .use(rehypeKatex)
    .use(rehypeSanitize, createChatSanitizeSchema())
    .run(unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown)) as Promise<Root>;
}

/** Whether a node can have children. */
function isParent(node: Nodes): node is Extract<Nodes, { children: unknown[] }> {
  return 'children' in node;
}

/** Every element in the tree, in document order. */
function elements(node: Nodes): Element[] {
  const found: Element[] = node.type === 'element' ? [node] : [];
  if (isParent(node)) {
    for (const child of node.children) {
      found.push(...elements(child));
    }
  }
  return found;
}

/** Every element name in the tree. */
function tagNames(node: Nodes): string[] {
  return elements(node).map(element => element.tagName);
}

/** The first element with this name, or undefined. */
function first(node: Nodes, tagName: string): Element | undefined {
  return elements(node).find(element => element.tagName === tagName);
}

/** All text in the tree, concatenated. */
function text(node: Nodes): string {
  if (node.type === 'text') {
    return node.value;
  }
  return isParent(node) ? node.children.map(text).join('') : '';
}

/** Every attribute value in the tree, as strings, for "must not contain" checks. */
function allValues(node: Nodes): string[] {
  return elements(node).flatMap(element =>
    Object.values(element.properties ?? {}).map(value => String(value)),
  );
}

describe('maths through the real pipeline', () => {
  it('should keep the structure of a fraction, not its leaf characters', async () => {
    const tree = await render('$\\frac{a}{b}$');

    // The failure this guards is not a missing equation. `rehype-sanitize`
    // drops a disallowed element and keeps its text, so an unnamed `mfrac`
    // leaves "ab" behind — a fraction read as a two-letter word.
    expect(tagNames(tree)).toContain('mfrac');
    expect(tagNames(tree)).toContain('math');
  });

  it('should keep aria-hidden on the layer KaTeX hides', async () => {
    const tree = await render('$x^2$');

    // Spelled `ariaHidden` in the schema. The hyphenated spelling matches no
    // hast property, so it silently stripped this and left a screen reader
    // reading the glyph spans as well as the MathML.
    const hidden = elements(tree).filter(element => element.properties?.ariaHidden);
    expect(hidden.length).toBeGreaterThan(0);
  });

  it('should not let TeX smuggle in a link or an image', async () => {
    const tree = await render('$\\href{javascript:alert(1)}{x}$ $\\includegraphics{x.png}$');

    expect(allValues(tree).join(' ')).not.toContain('javascript:');
    expect(tagNames(tree)).not.toContain('mglyph');
  });
});

describe('gFM through the real pipeline', () => {
  it('should keep a table whole', async () => {
    const tree = await render('| Bar | Value |\n| :-- | ----: |\n| Jan | 45.2 |\n');

    // The reported symptom was "BarValueJan45.2" — every cell boundary gone
    // and the numbers left with nothing binding them to a label.
    expect(tagNames(tree)).toEqual(
      expect.arrayContaining(['table', 'thead', 'tbody', 'tr', 'th', 'td']),
    );
    expect(first(tree, 'th')?.properties?.align).toBe('left');
    expect(elements(tree).filter(e => e.tagName === 'td')[1]?.properties?.align).toBe('right');
  });

  it('should keep a task list checkbox inert and distinguishable', async () => {
    const tree = await render('- [x] done\n- [ ] todo\n');

    const boxes = elements(tree).filter(element => element.tagName === 'input');
    expect(boxes).toHaveLength(2);
    // `checked` is what tells the two apart; `disabled` is what keeps the
    // control from being operable inside a transcript.
    expect(boxes[0].properties).toMatchObject({ type: 'checkbox', checked: true, disabled: true });
    expect(boxes[1].properties).toMatchObject({ type: 'checkbox', disabled: true });
    expect(boxes[1].properties?.checked).toBeFalsy();
  });

  it('should rewrite an input type it does not allow, rather than dropping it', async () => {
    // Not driven through the pipeline: remark-gfm only ever emits
    // `type="checkbox"`, so rendering markdown cannot tell the tuple form
    // `['type', 'checkbox']` apart from the bare name `'type'` — the first
    // version of this case asserted the type was `checkbox` and passed
    // against both. The difference only appears for a value the pipeline
    // cannot produce, so the tree is built by hand and sanitised directly.
    //
    // It matters because the two fail differently: the tuple replaces a
    // disallowed value, while the bare name would admit it, and an `input`
    // whose type is dropped altogether renders as a text box.
    const { sanitize } = await import('hast-util-sanitize');
    const hidden: Root = {
      type: 'root',
      children: [{
        type: 'element',
        tagName: 'input',
        properties: { type: 'hidden', name: 'stolen' },
        children: [],
      }],
    };

    const clean = sanitize(hidden, createChatSanitizeSchema());

    expect(first(clean, 'input')?.properties?.type).toBe('checkbox');
    expect(first(clean, 'input')?.properties?.name).toBeUndefined();
  });

  it('should keep a numbered list starting where it was written', async () => {
    const tree = await render('2. two\n3. three\n');

    expect(first(tree, 'ol')?.properties?.start).toBe(2);
  });

  it('should keep headings, strikethrough and the rule', async () => {
    const tree = await render('## Summary\n\n~~gone~~\n\n---\n');

    expect(tagNames(tree)).toEqual(expect.arrayContaining(['h2', 'del', 'hr']));

    const del = first(tree, 'del');
    // `del && text(del)` rather than a non-null assertion: a missing element
    // then fails as `undefined` instead of throwing somewhere less legible.
    expect(del && text(del)).toBe('gone');
  });

  it('should keep the footnote label the backref announces with', async () => {
    const tree = await render('text[^1]\n\n[^1]: the note\n');

    // The only `aria-label` that should reach a chat link. It comes from
    // remark-gfm rather than from React, so nothing in `TypingEffect` puts it
    // there — which is exactly why removing the link override had to leave it
    // intact rather than replace it.
    const labels = elements(tree)
      .map(element => element.properties?.ariaLabel)
      .filter(Boolean);
    expect(labels).toContain('Back to reference 1');
  });
});

describe('what a response must not be able to do', () => {
  it('should strip a javascript: URL from a link while keeping https', async () => {
    const tree = await render('[bad](javascript:alert(1)) [good](https://example.com)');

    // `protocols` is not named in the schema. The default map still applies
    // because the schema declares only `tagNames` and `attributes`, and
    // hast-util-sanitize merges one level deep — every key left out keeps its
    // default. A test on the schema's shape cannot show that it still works.
    const hrefs = elements(tree).map(element => element.properties?.href).filter(Boolean);
    expect(hrefs).toContain('https://example.com');
    expect(hrefs.join(' ')).not.toContain('javascript:');
  });

  it('should strip a javascript: URL from an image source', async () => {
    const tree = await render('![x](javascript:alert(1))');

    expect(allValues(tree).join(' ')).not.toContain('javascript:');
  });

  it('should drop a raw HTML block rather than parsing it', async () => {
    const tree = await render('<img src=x onerror=alert(1)>\n\n<script>alert(1)</script>');

    // The pipeline runs without `rehype-raw`, so raw HTML never becomes
    // markup. A block of it does not survive at all — not as an element and
    // not as text. This is the premise several comments in the schema rest
    // on, and the first version of this test asserted the wrong mechanism:
    // "escaped to text" would have left `onerror` readable in the transcript.
    expect(tagNames(tree)).not.toContain('img');
    expect(tagNames(tree)).not.toContain('script');
    expect(text(tree)).toBe('');
  });

  it('should strip an inline tag while keeping the words around it', async () => {
    const tree = await render('a <b>bold</b> c and <a href="#" onclick="alert(1)">x</a>');

    // Inline raw HTML behaves differently from a block: the tag goes, the
    // text stays. Worth pinning separately, because "raw HTML is dropped" is
    // true of the markup and not of the sentence a user wrote.
    expect(tagNames(tree)).toEqual(['p']);
    expect(text(tree)).toBe('a bold c and x');

    const handlers = elements(tree).flatMap(element =>
      Object.keys(element.properties ?? {}).filter(name => name.toLowerCase().startsWith('on')),
    );
    expect(handlers).toEqual([]);
  });
});
