/**
 * Argument handling for `scripts/test.js`, kept separate so it can be tested.
 *
 * The runner itself spawns Jest on import, so nothing can load it to check
 * these. They are the parts with a decision in them, and the parts that have
 * already been wrong once: a filter naming a file in one project made the other
 * project's run fail on finding nothing.
 *
 * Plain JS with hand-written declarations beside it, the same arrangement as
 * `vite-plugin-woff2-only.js` — `scripts/test.js` is run directly by node, and
 * `tsconfig.json` sets `allowJs: false`, so a `.ts` module could not be
 * imported there and a `.js` one cannot be typed without the `.d.ts`.
 */

const SELECT = '--selectProjects';

/**
 * Removes `--selectProjects` from an argument list and returns what it named.
 *
 * Taken out rather than passed through, because the runner adds it back one
 * project at a time. Jest's flag is variadic, so `--selectProjects unit esm`
 * would otherwise reach a single process and put two module systems back
 * together — silently, since Jest is happy to run it.
 *
 * Both of Jest's spellings are handled: `--selectProjects a b` and a repeated
 * `--selectProjects=a`. A comma-separated `--selectProjects=a,b` is not a form
 * Jest accepts either, and is left to fail as the unknown project name it is.
 *
 * `dangling` reports the flag appearing with no project after it. Jest rejects
 * that outright, so the runner has to hand the arguments over untouched rather
 * than treat "named nothing" as "named everything" — putting the bare flag back
 * would not do, since Jest absorbs it silently once the per-project flag is
 * added alongside.
 * @param {string[]} args - The arguments as given.
 * @returns {{rest: string[], selected: string[], dangling: boolean}} Arguments
 * without the flag, the project names it named, and whether it named none.
 */
export function takeSelection(args) {
  const rest = [];
  const selected = [];
  let dangling = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg.startsWith(`${SELECT}=`)) {
      selected.push(arg.slice(SELECT.length + 1));
    } else if (arg === SELECT) {
      const before = selected.length;
      // Variadic: every following value up to the next flag belongs to it.
      while (index + 1 < args.length && !args[index + 1].startsWith('-')) {
        index++;
        selected.push(args[index]);
      }
      dangling = dangling || selected.length === before;
    } else {
      rest.push(arg);
    }
  }

  return { rest, selected, dangling };
}

/**
 * Whether a run could narrow the set of test files, and so needs the check in
 * {@link isNarrowed}.
 *
 * Only a positional argument is a path filter; `--coverage` and `--ci` are not,
 * and asking Jest to list its tests twice on their account is wasted work.
 *
 * Deliberately approximate in the one direction that costs nothing. A flag
 * whose value is separated by a space — `--maxWorkers 2` — makes this answer
 * yes, and the check then finds the set was not narrowed and stays strict. The
 * opposite mistake is impossible, since a path filter never begins with `-`.
 * @param {string[]} args - Arguments with `--selectProjects` already removed.
 * @returns {boolean} True if any argument could be a path filter.
 */
export function hasPathFilter(args) {
  return args.some(arg => !arg.startsWith('-'));
}

/**
 * Whether a project matching no tests should be tolerated.
 *
 * True only when the filter narrowed the set to a non-empty subset, which is
 * the case a per-project run cannot tell apart from a mistake on its own. Two
 * others have to keep failing: a filter matching nothing anywhere is a typo,
 * and a project matching nothing on an unfiltered run is a broken `testMatch`,
 * which would mean its suites silently never ran.
 * @param {string[] | null} matched - Test files the arguments match, or null if
 * Jest could not be asked.
 * @param {string[] | null} everything - Test files with no arguments, or null.
 * @returns {boolean} True if a project may match nothing without failing.
 */
export function isNarrowed(matched, everything) {
  return matched !== null && everything !== null
    && matched.length > 0 && matched.length < everything.length;
}
