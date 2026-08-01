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
    // Takes whatever `className=` is given — a quoted string, or a braced
    // expression — and looks for the class in any string literal inside it.
    // A braced expression is included so a conditional
    // `className={hidden ? 'sr-only' : undefined}` is caught as well as a
    // plain literal; `className={someVariable}` contains no literal and so
    // matches nothing, which is what leaves the `h2` override below alone.
    const CLASS_NAME = /className=(\{[^}]*\}|["'`][^"'`]*["'`])/g;
    const STRING_LITERAL = /["'`]([^"'`]*)["'`]/g;

    // Whole tokens, not `\bsr-only\b` — that looks equivalent and is not:
    // `-` is a non-word character, so it sits beside the boundary and also
    // matches `not-sr-only` and `sr-only-thing`, failing this suite over a
    // class with nothing to do with hiding anything.
    const assignsSrOnly = (expression: string): boolean =>
      [...expression.matchAll(STRING_LITERAL)]
        .some(([, value]) => value.split(/\s+/).includes('sr-only'));

    const offenders = sourceFiles().filter((file) => {
      const contents = readFileSync(join(ROOT, file), 'utf8');
      return [...contents.matchAll(CLASS_NAME)]
        .some(([, expression]) => assignsSrOnly(expression));
    });

    expect(offenders).toEqual([]);
  });
});
