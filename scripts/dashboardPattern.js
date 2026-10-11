/**
 * Post-build guard: no bundle may contain the text Quarto's dashboard filter
 * lifts out of a card.
 *
 * Quarto's `dashboard.lua` moves any cell output that matches the Lua pattern
 * `bslib-` out of its card, as a component of its own -- and a Lua `-` is a
 * quantifier, so the pattern matches plain `bsli`. py-maidr writes maidr.js
 * into a cell's output when it bundles the script, so a bundle containing
 * those four letters has its chart pulled out of the card and the cell
 * emptied. The host guard needs the card component's namespace, which starts
 * with them, so `src/service/hostGuard.ts` joins it from parts at runtime --
 * but a minifier folds most ways of spelling it back into the literal, and
 * nothing in the unit suite reads a built bundle, so this reads the output.
 *
 * Plain JS so `scripts/build.js` can import it; the types are in
 * `dashboardPattern.d.ts`. Keep both files in sync.
 */

import fs from 'node:fs';
import path from 'node:path';

/** The text the dashboard filter matches. */
export const DASHBOARD_PATTERN_TEXT = 'bsli';

/**
 * Find the bundles in `distDir` that contain the text.
 *
 * Reads every `.js` and `.mjs` file, chunks in subdirectories included.
 *
 * @param distDir - The build output directory
 * @returns The offending files, relative to `distDir`
 */
export function findDashboardPatternBundles(distDir) {
  const offenders = [];
  const queue = [distDir];
  while (queue.length > 0) {
    const dir = queue.shift();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(file);
      } else if (/\.m?js$/.test(entry.name) && fs.readFileSync(file, 'utf8').includes(DASHBOARD_PATTERN_TEXT)) {
        offenders.push(path.relative(distDir, file));
      }
    }
  }
  return offenders.sort();
}

/**
 * Throw when any bundle in `distDir` contains the text.
 *
 * @param distDir - The build output directory
 */
export function assertNoDashboardPattern(distDir) {
  const offenders = findDashboardPatternBundles(distDir);
  if (offenders.length === 0)
    return;
  throw new Error(
    `These bundles contain "${DASHBOARD_PATTERN_TEXT}", which Quarto's dashboard filter `
    + 'matches: a chart py-maidr writes into a dashboard card with the bundled script '
    + `would be lifted out of its card.\n${offenders.map(file => `  ${file}`).join('\n')}\n`
    + 'Build the name from parts the minifier cannot fold, as src/service/hostGuard.ts '
    + 'does with CARD_NAMESPACE, and keep it out of comments and identifiers.',
  );
}
