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
 * Turns a message id into something safe to put in an `id`, injectively.
 *
 * A message id is `msg-1234` or `resp-1234-<model>`, and a model name can
 * carry a dot or a slash. Every character outside `[A-Za-z0-9-]` becomes
 * `_<hex>_`, which cannot be confused with a literal because `_` is itself
 * outside the set and so is escaped too. Two different message ids therefore
 * cannot encode to the same token, which is what the uniqueness rests on.
 * @param messageId - The message's id.
 * @returns An id-safe token.
 */
function token(messageId: string): string {
  return messageId.replace(
    /[^\w-]|_/g,
    character => `_${character.charCodeAt(0).toString(16)}_`,
  );
}

/** Every element in the tree, in document order. */
function elements(node: Nodes): Element[] {
  const found: Element[] = node.type === 'element' ? [node] : [];
  if ('children' in node) {
    for (const child of node.children) {
      found.push(...elements(child));
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

    for (const element of all) {
      const id = element.properties?.id;
      if (typeof id === 'string' && id !== '') {
        present.add(id);
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

      if (typeof properties.id === 'string' && properties.id !== '') {
        properties.id = scope + properties.id;
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
