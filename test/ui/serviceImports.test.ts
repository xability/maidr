/**
 * The view layer does not call services.
 *
 * `rules/ui.md` puts it plainly — "No `useSelector`, no service imports, no
 * model imports" — and the reason is not tidiness: a component that starts a
 * network request on its own account owns a side effect nothing else can see,
 * cancel, or reuse, and the same request then grows a second call site with
 * its own idea of what a stale response is. That is exactly what happened to
 * the LLM credential probe, which ran from `Settings.tsx` and, separately,
 * from `useOllamaModels`.
 *
 * What is checked is the *service*, not every symbol that happens to live in
 * `src/service/`: `modelVersions` is a catalog of constants and a pure lookup,
 * with no behaviour to route through a view model. Where that file belongs is
 * a separate question from this one — `scripts/check-model-catalog.mjs` and
 * `.github/workflows/model-catalog-check.yml` both name it by path.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';

const UI_DIR = resolve(__dirname, '../../src/ui');
const ROOT = resolve(__dirname, '../..');

/** Matches an import of a `…Service` class from the service layer. */
const SERVICE_IMPORT = /import\s+(?:type\s+)?\{[^}]*\b\w+Service\b[^}]*\}\s+from\s+'@service\//;

/**
 * Every TypeScript source file under a directory.
 * @param dir - The directory to walk.
 * @returns Absolute paths of the files found.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe('the view layer', () => {
  it('should reach services through a view model or a state hook, never directly', () => {
    const offenders = sourceFiles(UI_DIR)
      .filter(path => SERVICE_IMPORT.test(readFileSync(path, 'utf8')))
      .map(path => relative(ROOT, path));

    expect(offenders).toEqual([]);
  });
});
