import type { Element, Nodes, Properties, Root } from 'hast';
import { defaultSchema } from 'rehype-sanitize';

/** One entry of a hast element's properties, in every shape hast allows. */
type PropertyValue = Properties[string];

/**
 * Repairs and namespaces the ids in a rendered chat message, so footnote
 * anchors resolve and two messages cannot claim the same id.
 *
 * Two faults, one pass, because fixing either alone leaves the other (#696).
 *
 * **The anchors dangle.** `mdast-util-to-hast` writes matching pairs, and then
 * `hast-util-sanitize` applies its `clobberPrefix` to everything in `clobber`
 * — `ariaDescribedBy`, `ariaLabelledBy`, `id`, `name`. `href` is not in that
 * list, so the target moves and the link is left naming where it used to be:
 *
 * ```
 * a  href="#user-content-fn-1"          <- untouched
 * li id="user-content-user-content-fn-1" <- prefixed again
 * ```
 *
 * `aria-describedby` survives precisely because it *is* in `clobber`, so it
 * moves in step with the `id` it names.
 *
 * **The ids collide across messages.** Footnotes are numbered per document and
 * each message is its own document, so every message with a footnote emits
 * `fn-1`. A transcript is one DOM, which makes them duplicates — and once the
 * anchors resolve, `getElementById` returns the first match, so a reference in
 * the second message would jump to the first message's note. The dangling
 * above is the only reason that has not been visible.
 *
 * Configuring a prefix cannot do this. `remark-rehype` takes `clobberPrefix`,
 * but it only reaches ids derived from the footnote label —
 * `mdast-util-to-hast` hardcodes the footnotes heading as `id: 'footnote-label'`
 * (`lib/footer.js:236`) and documents that it is "always added" — so a
 * per-message prefix still leaves that one colliding. Rewriting the tree is the
 * only place both can be fixed.
 */

/**
 * The prefix `hast-util-sanitize` has already applied to every `id`.
 *
 * Read from the library rather than written out, because it is the value the
 * sanitiser actually used: the chat schema declares only `tagNames` and
 * `attributes`, so `clobberPrefix` is whatever the default says, and a copy
 * here would be a second source of truth that could silently stop matching.
 */
const CLOBBERED = defaultSchema.clobberPrefix ?? '';

/**
 * Properties naming other elements' ids, which have to move with them.
 *
 * `href` is handled separately: the others were rewritten by the sanitiser and
 * so already name the current id, while `href` still names the original.
 */
const ID_REFERENCES = ['ariaDescribedBy', 'ariaLabelledBy'] as const;

/**
 * Whether this element's `name` is a fragment target rather than a field name.
 *
 * `name` is in the sanitiser's `clobber` list for the same reason `id` is —
 * a browser resolves `#foo` against an anchor's `name` as well as an `id` — so
 * it has to be scoped alongside `id` or an `href` aimed at one would dangle
 * exactly as this fixes for `id`.
 *
 * Only on an anchor, though. Everywhere else `name` is a form control's field
 * name, and renaming that would change what a form submits rather than where a
 * link goes. The chat schema admits neither today — `input` is pinned to
 * `type`, `checked` and `disabled` precisely to keep `name` out — so this is
 * about the plugin staying correct if one is ever allowed in, not about markup
 * that reaches it now.
 * @param element - The element to test.
 * @returns True if `name` on this element names a fragment.
 */
function namesFragment(element: Element): boolean {
  return element.tagName === 'a';
}

/**
 * Turns a message id into an id-safe token that no other message id can share.
 *
 * Every character outside `[A-Za-z0-9]` becomes `_<hex>_`. That is injective on
 * its own — `_` is itself outside the set, so an underscore in the output only
 * ever begins an escape — and it is exercised in practice: a response id is
 * `resp-<time>-<provider>` and the providers are `OPENAI`, `ANTHROPIC_CLAUDE`,
 * `GOOGLE_GEMINI` and `OLLAMA`, three of which carry an underscore.
 *
 * `-` is escaped along with everything else, which matters for a reason
 * injectivity alone does not cover. The final id is
 * `user-content-<token>-<id>`, so what has to be unique is the whole
 * concatenation rather than the token: with `-` left intact, token `m` with id
 * `x-y` and token `m-x` with id `y` both spell `user-content-m-x-y`. Escaping
 * it keeps `-` out of every token, which makes the first one the boundary and
 * the decomposition unique — the property the cross-message guarantee actually
 * rests on. `should keep the scope and the id it prefixes tellable apart`, in
 * `test/util/footnoteScope.esm-test.ts`, is that pair as a test.
 * @param messageId - The message's id.
 * @returns An id-safe token containing no separator.
 */
function token(messageId: string): string {
  return messageId.replace(
    /[^a-z0-9]/gi,
    character => `_${character.charCodeAt(0).toString(16)}_`,
  );
}

/**
 * The properties on this element that define a fragment target.
 * @param element - The element to inspect.
 * @returns `['id']`, or `['id', 'name']` on an anchor.
 */
function targetAttributes(element: Element): readonly string[] {
  return namesFragment(element) ? ['id', 'name'] : ['id'];
}

/**
 * The fragment targets this element defines.
 * @param element - The element to inspect.
 * @returns Every non-empty target name on it.
 */
function targets(element: Element): string[] {
  return targetAttributes(element)
    .map(attribute => element.properties?.[attribute])
    .filter((value): value is string => typeof value === 'string' && value !== '');
}

/**
 * Every element in the tree, in document order.
 *
 * Accumulates into one array rather than spreading a new one at each level:
 * this runs on every render, and the typing animation renders every 10 ms.
 * @param node - Where to start.
 * @param found - The array being filled.
 * @returns `found`.
 */
function elements(node: Nodes, found: Element[] = []): Element[] {
  if (node.type === 'element') {
    found.push(node);
  }
  if ('children' in node) {
    for (const child of node.children) {
      elements(child, found);
    }
  }
  return found;
}

/**
 * Rewrites an id-valued property, which hast may hold as a string or a list.
 *
 * `ariaDescribedBy` arrives as `['user-content-footnote-label']` — hast models
 * space-separated attributes as arrays, and reading it as a string is why the
 * first version of this left the one reference that worked pointing at an id
 * that no longer existed.
 * @param value - The property's current value.
 * @param rename - Maps a current id to its scoped replacement.
 * @returns The value with known ids replaced, in the shape it arrived in.
 */
function reference(value: PropertyValue, rename: (id: string) => string): PropertyValue {
  if (typeof value === 'string') {
    return value.split(/\s+/).filter(Boolean).map(rename).join(' ');
  }
  if (Array.isArray(value)) {
    return value.map(item => (typeof item === 'string' ? rename(item) : item));
  }
  return value;
}

/**
 * A rehype plugin that scopes a message's ids to that message and re-points
 * everything naming them.
 *
 * Must run **after** `rehype-sanitize`. Before it, the sanitiser would prefix
 * the ids again and undo the agreement this restores.
 *
 * The scope keeps the `user-content-` convention that carries the
 * anti-clobbering guarantee — chat content cannot define an `id` that shadows
 * one on the host page — and adds the per-message part that makes it unique.
 * That guarantee now comes from here rather than from the sanitiser's prefix,
 * which is the trade this fix makes knowingly; `test/util/footnoteScope.esm-test.ts`
 * pins it.
 * @param options - The message this tree belongs to.
 * @param options.messageId - Its id, which becomes the scope.
 * @returns The transform.
 */
export function rehypeScopeIds(options: { messageId: string }): (tree: Root) => void {
  const scope = `user-content-${token(options.messageId)}-`;

  return (tree: Root): void => {
    const all = elements(tree);
    const present = new Set<string>();

    // Collected in a pass of its own, before anything is written, so the
    // rewriting below cannot see a half-renamed tree and is order-independent.
    for (const element of all) {
      for (const target of targets(element)) {
        present.add(target);
      }
    }

    if (present.size === 0) {
      return;
    }

    /**
     * The scoped name for an id that already exists in this tree.
     * @param id - An id as it appears now.
     * @returns The scoped id, or the input if this tree does not define it.
     */
    const scoped = (id: string): string => (present.has(id) ? scope + id : id);

    for (const element of all) {
      const properties = element.properties;
      if (!properties) {
        continue;
      }

      for (const attribute of targetAttributes(element)) {
        const value = properties[attribute];
        if (typeof value === 'string' && value !== '') {
          properties[attribute] = scope + value;
        }
      }

      for (const attribute of ID_REFERENCES) {
        if (attribute in properties) {
          properties[attribute] = reference(properties[attribute], scoped);
        }
      }

      const href = properties.href;
      if (typeof href === 'string' && href.startsWith('#')) {
        // The one place the sanitiser's damage is undone rather than followed.
        // Every other reference was rewritten alongside its target, so it names
        // the current id; `href` was not, so it still names the original and
        // has to be matched against the prefixed form first.
        const named = href.slice(1);
        const target = present.has(CLOBBERED + named)
          ? CLOBBERED + named
          : named;

        if (present.has(target)) {
          properties.href = `#${scope}${target}`;
        }
      }
    }
  };
}
