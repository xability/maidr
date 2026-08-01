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

    expect(visuallyHidden.clip).toBe('rect(0, 0, 0, 0)');
    expect(visuallyHidden.position).toBe('absolute');
    expect(visuallyHidden.overflow).toBe('hidden');
  });

  it('should be used instead of an sr-only class no stylesheet defines', () => {
    // MAIDR ships no stylesheet: `dist/maidr.css` is a placeholder and the UI
    // is styled at runtime by emotion. So `className="sr-only"` is not a
    // hidden element, it is a plain one — `TypingEffect`'s live region carried
    // it and rendered every finished chat message a second time, in full, on
    // any page that did not happen to define the class itself.
    const offenders = sourceFiles().filter((file) => {
      const contents = readFileSync(join(ROOT, file), 'utf8');
      return /className=["'][^"']*\bsr-only\b/.test(contents);
    });

    expect(offenders).toEqual([]);
  });
});
