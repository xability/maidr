/**
 * Post-build guard: no ESM bundle may reach rolldown's CommonJS `require` shim.
 *
 * When a bundled CommonJS module calls `require()` on an external, rolldown
 * answers it with a shim that calls the host's `require` -- and throws when
 * there is none, as in every browser. An ESM bundle that carries the shim, or
 * imports a chunk that does, loads fine and then throws the moment the CommonJS
 * module is first evaluated, which for `use-sync-external-store` is the first
 * render: the host page comes up blank (#1370). `vite build` exits 0 either
 * way, and nothing in the unit suite imports a built bundle, so this reads the
 * output instead.
 *
 * Plain JS so `scripts/build.js` can import it; the types are in
 * `esmRequireShim.d.ts`. Keep both files in sync.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * The text of the error rolldown's shim throws. The check is only as good as
 * this string: if rolldown rewords the message it stops matching and every
 * build passes, so re-read the shim in a fresh `dist/rolldown-runtime-*.js`
 * when bumping vite.
 */
export const REQUIRE_SHIM_MARKER = 'in an environment that doesn\'t expose the `require` function';

const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.\.?\/[^"']+)["']/g;

/**
 * Find the ESM bundles in `distDir` that reach the `require` shim.
 *
 * Follows each top-level `.mjs` bundle through the relative imports of the
 * chunks it loads, statically or dynamically.
 *
 * @param distDir - The build output directory
 * @returns One entry per bundle that reaches the shim, naming the file that
 *   carries it
 */
export function findRequireShimBundles(distDir) {
  const offenders = [];
  const entries = fs.readdirSync(distDir).filter(name => name.endsWith('.mjs'));
  for (const entry of entries) {
    const seen = new Set();
    const queue = [path.join(distDir, entry)];
    while (queue.length > 0) {
      const file = queue.shift();
      if (seen.has(file) || !fs.existsSync(file))
        continue;
      seen.add(file);
      const source = fs.readFileSync(file, 'utf8');
      if (source.includes(REQUIRE_SHIM_MARKER)) {
        offenders.push({ bundle: entry, chunk: path.relative(distDir, file) });
        break;
      }
      for (const match of source.matchAll(RELATIVE_IMPORT))
        queue.push(path.resolve(path.dirname(file), match[1]));
    }
  }
  return offenders;
}

/**
 * Throw when any ESM bundle in `distDir` reaches the `require` shim.
 *
 * @param distDir - The build output directory
 */
export function assertNoRequireShim(distDir) {
  const offenders = findRequireShimBundles(distDir);
  if (offenders.length === 0)
    return;
  const lines = offenders.map(({ bundle, chunk }) => `  ${bundle} -> ${chunk}`);
  throw new Error(
    'These ESM bundles reach rolldown\'s CommonJS `require` shim, which throws in '
    + 'a browser (#1370):\n'
    + `${lines.join('\n')}\n`
    + 'A bundled CommonJS module calls `require()` on an external. Hand that external '
    + 'to esmExternalRequirePlugin in scripts/build.js (see REACT_RUNTIME).',
  );
}
