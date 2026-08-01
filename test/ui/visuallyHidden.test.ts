import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { visuallyHidden } from '@ui/visuallyHidden';

/**
 * Guards the two ways visually-hidden content silently stops working here.
 *
 * Neither is visible in a component test: `TypingEffect` imports
 * `react-markdown`, which is ESM and unloadable by this CommonJS suite (#678),
 * and the failure that prompted this is a *missing* stylesheet rather than
 * anything a rendered tree would show.
 */

const ROOT = resolve(__dirname, '../..');

/** Every tracked source file that could render markup. */
function sourceFiles(): string[] {
  return execFileSync('git', ['ls-files', 'src'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(file => file.endsWith('.tsx') || file.endsWith('.ts'));
}

/**
 * Every expression handed to a `className=` prop.
 *
 * Braces are counted rather than matched with `\{[^}]*\}`, which ends at the
 * first `}` — so a template holding any interpolation is truncated there and
 * its class names are never seen. `` className={`${cond} sr-only`} `` reduces
 * to `` {`${cond} ``, which contains no complete string and reads as clean.
 * @param contents - The source file to scan.
 * @returns Each expression, including its delimiters.
 */
function classNameExpressions(contents: string): string[] {
  const expressions: string[] = [];

  for (const match of contents.matchAll(/className=/g)) {
    const start = (match.index ?? 0) + match[0].length;
    const opener = contents[start];

    if (opener === '{') {
      let depth = 0;
      for (let i = start; i < contents.length; i++) {
        if (contents[i] === '{') {
          depth++;
        } else if (contents[i] === '}') {
          depth--;
          if (depth === 0) {
            expressions.push(contents.slice(start, i + 1));
            break;
          }
        }
      }
    } else if (opener === '"' || opener === '\'' || opener === '`') {
      const end = contents.indexOf(opener, start + 1);
      if (end !== -1) {
        expressions.push(contents.slice(start, end + 1));
      }
    }
  }

  return expressions;
}

/**
 * Whether an expression puts the `sr-only` class on an element.
 *
 * Compares whole tokens rather than testing `\bsr-only\b`, which looks
 * equivalent and is not: `-` is a non-word character, so that pattern sits
 * beside the boundary and also matches `not-sr-only` and `sr-only-thing` —
 * failing this suite over a class with nothing to do with hiding anything.
 *
 * An expression with no string literal in it — `className={someVariable}` —
 * matches nothing, which is what leaves the `h2` override alone. That
 * override is the one place here that legitimately *reads* the class.
 * @param expression - One `className=` expression.
 * @returns True if any string literal in it carries the class.
 */
function assignsSrOnly(expression: string): boolean {
  return [...expression.matchAll(/["'`]([^"'`]*)["'`]/g)]
    .some(([, value]) => value.split(/\s+/).includes('sr-only'));
}

describe('visuallyHidden', () => {
  it('should keep hidden content in the accessibility tree', () => {
    // The whole point, and the easiest thing to lose while "simplifying":
    // `display: none` and `visibility: hidden` are shorter, look equivalent,
    // and remove the element from the accessibility tree — which would mute
    // the live regions that use this rather than merely restyling them.
    expect(visuallyHidden.display).toBeUndefined();
    expect(visuallyHidden.visibility).toBeUndefined();

    expect(visuallyHidden.position).toBe('absolute');
    expect(visuallyHidden.overflow).toBe('hidden');
    // Both spellings. `clip` is deprecated in favour of `clipPath`, but it is
    // the one every engine still honours for this idiom, so dropping either
    // widens the set of browsers that render the element.
    expect(visuallyHidden.clip).toBe('rect(0, 0, 0, 0)');
    expect(visuallyHidden.clipPath).toBe('inset(50%)');
  });

  it('should be used instead of an sr-only class no stylesheet defines', () => {
    // MAIDR ships no stylesheet: `dist/maidr.css` is a placeholder and the UI
    // is styled at runtime by emotion. So `className="sr-only"` is not a
    // hidden element, it is a plain one — `TypingEffect`'s live region carried
    // it and rendered every finished chat message a second time, in full, on
    // any page that did not happen to define the class itself.
    const offenders = sourceFiles().filter((file) => {
      const contents = readFileSync(join(ROOT, file), 'utf8');
      return classNameExpressions(contents).some(assignsSrOnly);
    });

    expect(offenders).toEqual([]);
  });
});
