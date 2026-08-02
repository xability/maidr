import type { Element, Root } from 'hast';
import { describe, expect, it } from '@jest/globals';
import { rehypeScopeIds } from '@util/footnoteScope';
import { createChatSanitizeSchema } from '@util/markdownSanitize';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

/**
 * The id scoping that makes footnote anchors resolve (#696).
 *
 * `test/ui/typingEffect.esm-test.tsx` covers the outcome — a reference reaches
 * its own note, two messages do not collide — by rendering the component. This
 * covers the properties that outcome rests on and that a rendered assertion
 * cannot show: that the scope is a namespace rather than a rename, that two
 * message ids can never produce the same scope, and that a link out of the
 * message is left alone.
 */

/** The chain `TypingEffect` renders with, stopped at the tree. */
async function render(markdown: string, messageId: string): Promise<Root> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, createChatSanitizeSchema())
    .use(rehypeScopeIds, { messageId });

  return processor.run(processor.parse(markdown)) as Promise<Root>;
}

/** Every element in the tree. */
function elements(node: Root | Element): Element[] {
  const found: Element[] = node.type === 'element' ? [node] : [];
  for (const child of node.children) {
    if (child.type === 'element') {
      found.push(...elements(child));
    }
  }
  return found;
}

/** Every id in the tree. */
function ids(tree: Root): string[] {
  return elements(tree)
    .map(element => element.properties?.id)
    .filter((id): id is string => typeof id === 'string');
}

/** Every `href` in the tree. */
function hrefs(tree: Root): string[] {
  return elements(tree)
    .map(element => element.properties?.href)
    .filter((href): href is string => typeof href === 'string');
}

const FOOTNOTE = 'text[^1]\n\n[^1]: the note\n';

describe('scoping a message\'s ids', () => {
  it('should leave every fragment link naming an id that exists', async () => {
    const tree = await render(FOOTNOTE, 'msg-1');

    const dangling = hrefs(tree)
      .filter(href => href.startsWith('#'))
      .filter(href => !ids(tree).includes(href.slice(1)));

    expect(dangling).toEqual([]);
  });

  it('should keep the prefix that stops chat ids shadowing the page', async () => {
    const tree = await render(FOOTNOTE, 'msg-1');

    // The anti-clobbering guarantee moves here from the sanitiser's own
    // `clobberPrefix`, which this plugin's rewriting supersedes. Worth pinning
    // where it now lives, because losing it is silent: ids would still be
    // unique per message and every test above would still pass while chat
    // content could define `id="search"` and shadow `document.forms.search`.
    expect(ids(tree).length).toBeGreaterThan(0);
    for (const id of ids(tree)) {
      expect(id.startsWith('user-content-')).toBe(true);
    }
  });

  it('should give two messages disjoint ids', async () => {
    const first = ids(await render(FOOTNOTE, 'msg-1'));
    const second = ids(await render(FOOTNOTE, 'msg-2'));

    expect(first).not.toEqual([]);
    expect(first.filter(id => second.includes(id))).toEqual([]);
  });

  it('should not let two different message ids encode to one scope', async () => {
    // `resp-<time>-<model>` puts a model name in the id, and a model name can
    // carry a dot or a slash. Stripping unsafe characters would map `a.b` and
    // `a-b` onto the same scope and silently reintroduce the collision this
    // exists to prevent, so they are escaped instead.
    const dotted = ids(await render(FOOTNOTE, 'resp-1-a.b'));
    const dashed = ids(await render(FOOTNOTE, 'resp-1-a-b'));
    const underscored = ids(await render(FOOTNOTE, 'resp-1-a_b'));

    expect(dotted.filter(id => dashed.includes(id))).toEqual([]);
    expect(dotted.filter(id => underscored.includes(id))).toEqual([]);
    expect(dashed.filter(id => underscored.includes(id))).toEqual([]);
  });

  it('should leave a link to somewhere outside the message alone', async () => {
    const tree = await render('[up](#top) and [out](https://example.com)', 'msg-1');

    // `#top` names nothing in this message. Scoping it would point it at an id
    // that does not exist either, so it is left as written — the page it was
    // aimed at is not this plugin's business.
    expect(hrefs(tree)).toEqual(['#top', 'https://example.com']);
  });

  it('should do nothing to a message with no ids in it', async () => {
    const tree = await render('just a [link](https://example.com)', 'msg-1');

    expect(ids(tree)).toEqual([]);
    expect(hrefs(tree)).toEqual(['https://example.com']);
  });
});

describe('the reference shapes hast can hold', () => {
  /**
   * Runs the plugin over a hand-built tree.
   *
   * Not through the pipeline, on purpose. `ariaLabelledBy` is not in the chat
   * allowlist, so the sanitiser strips it before the plugin could ever see it,
   * and a rendered message therefore cannot exercise that branch — nor the
   * string form below, since `mdast-util-to-hast` only ever emits the array.
   * Both are handled because the plugin scopes ids in general rather than
   * footnote ids in particular, and admitting either to the schema later must
   * not quietly produce a reference pointing at an id that no longer exists.
   * @param properties - Properties for the referring element.
   * @returns The referring element after scoping.
   */
  function scope(properties: Element['properties']): Element {
    const tree: Root = {
      type: 'root',
      children: [
        { type: 'element', tagName: 'h2', properties: { id: 'label' }, children: [] },
        { type: 'element', tagName: 'p', properties, children: [] },
      ],
    };

    rehypeScopeIds({ messageId: 'msg-1' })(tree);

    return elements(tree).filter(element => element.tagName === 'p')[0];
  }

  it('should move a list-valued reference with the id it names', () => {
    const referring = scope({ ariaLabelledBy: ['label'] });

    expect(referring.properties?.ariaLabelledBy).toEqual(['user-content-msg-1-label']);
  });

  it('should move a string-valued reference with the id it names', () => {
    const referring = scope({ ariaDescribedBy: 'label' });

    expect(referring.properties?.ariaDescribedBy).toBe('user-content-msg-1-label');
  });

  it('should leave a reference to an id this message does not define', () => {
    const referring = scope({ ariaLabelledBy: ['label', 'elsewhere'] });

    // Half known, half not — the unknown name belongs to the host page, and
    // scoping it would point it at nothing.
    expect(referring.properties?.ariaLabelledBy).toEqual([
      'user-content-msg-1-label',
      'elsewhere',
    ]);
  });
});
