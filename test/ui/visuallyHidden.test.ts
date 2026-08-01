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
    // Matches the quoted, braced and template forms — `className="sr-only"`,
    // `className={'sr-only'}` and `` className={`sr-only`} `` — since only the
    // first is the obvious way to write it.
    //
    // Compares whole class tokens rather than testing `\bsr-only\b`, which
    // looks equivalent and is not: `-` is a non-word character, so that
    // pattern also matches `not-sr-only` and `sr-only-thing` and would fail
    // this suite over a class that has nothing to do with hiding anything.
    const ASSIGNED_CLASS = /className=\{?\s*["'`]([^"'`]*)["'`]/g;

    const offenders = sourceFiles().filter((file) => {
      const contents = readFileSync(join(ROOT, file), 'utf8');
      return [...contents.matchAll(ASSIGNED_CLASS)]
        .some(([, value]) => value.split(/\s+/).includes('sr-only'));
    });

    expect(offenders).toEqual([]);
  });
});
