/**
 * Jest runner: supplies `--experimental-vm-modules`, and runs one Jest process
 * per project.
 *
 * **The flag.** The `esm` project in `jest.config.ts` loads the
 * unified/remark/rehype stack, which is ESM-only. Jest can only import ESM when
 * Node's VM modules API is enabled, and that is a process-level flag rather
 * than something a config can turn on.
 *
 * `NODE_OPTIONS=… jest` in the npm script would be the one-liner, but that
 * syntax is not valid in the Windows shell npm uses, so the script would work
 * for some contributors and not others. Setting it here keeps `npm test` the
 * same command everywhere, and adds no dependency — `cross-env` was the other
 * option and this repo already prefers a `scripts/` runner (see build.js).
 *
 * The flag is safe for the CommonJS project, which runs unchanged under it.
 *
 * **One process per project.** Jest can run `projects` in a single process, and
 * did until a component test joined the `esm` project. It cannot once two
 * projects load the same source file with different module semantics:
 * `jest-resolve` memoises "is this file ESM?" keyed on the path alone, ignoring
 * the asking project's `extensionsToTreatAsEsm` (see
 * `jest-resolve/build/shouldLoadAsEsm.js`). So the first project to ask about
 * `src/type/grammar.ts` answers for both, and whichever runs second fails with
 * `Must use import to load ES Module` — or not, depending on the order Jest
 * happened to schedule them in, which is why this surfaced as a suite that
 * passed alone and failed together.
 *
 * It stayed hidden while the `esm` project imported one leaf module. Rendering
 * a component pulls in the store, the view models and the grammar, so the two
 * projects now share most of `src/`.
 *
 * Separate processes are the fix rather than a workaround: the memo is
 * process-wide, and nothing in a Jest config can scope it.
 *
 * Arguments are forwarded, so `npm test -- --watch` and
 * `npm test -- test/util/version.test.ts` behave as they would with Jest
 * directly. Two are intercepted to keep that true: `--selectProjects`, so that
 * naming several projects still runs them one process each rather than putting
 * them back in one, and a filter matching only one project's tests, which one
 * process per project would otherwise fail on the other.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import process from 'node:process';
import {
  hasPathFilter,
  isNarrowed,
  PROJECTS,
  SELECT,
  takeSelection,
  WATCH_DEFAULT,
} from './testArgs.js';

const FLAG = '--experimental-vm-modules';

// Appended rather than replaced: a contributor may already be setting
// something here, and CI runners sometimes set memory limits this way.
const nodeOptions = [process.env.NODE_OPTIONS, FLAG].filter(Boolean).join(' ');

// Resolved rather than looked up on PATH. `npm test` puts `node_modules/.bin`
// there, so a bare `jest` works from an npm script and fails with ENOENT when
// this file is run directly — which is a confusing way to learn that. Running
// Jest's own entry point through `node` also keeps the flag applying to the
// process that needs it, without depending on a shim.
const jest = createRequire(import.meta.url).resolve('jest/bin/jest');

/**
 * Runs Jest once and resolves with its exit code.
 * @param {string[]} args - Arguments to pass to Jest.
 * @returns {Promise<number>} The exit code; 1 for a signal or a failed spawn.
 */
function runJest(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [jest, ...args], {
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: nodeOptions },
    });

    child.on('error', (error) => {
      console.error('[test] could not start jest:', error.message);
      resolve(1);
    });

    // Signals surface as a null code. Report them as a failure rather than as
    // success, which is what `resolve(code)` alone would do.
    child.on('exit', (code, signal) => {
      if (signal) {
        console.error(`[test] jest terminated by ${signal}`);
        resolve(1);
      } else {
        resolve(code ?? 1);
      }
    });
  });
}

/**
 * Test files matching these arguments, across every project asked for at once.
 *
 * Safe as a single multi-project process, unlike an actual run: `--listTests`
 * resolves paths and loads no module, so the memo described above never gets a
 * chance to disagree with itself.
 * @param {string[]} args - Arguments to match against.
 * @returns {Promise<string[] | null>} Matching test file paths, or null if Jest
 * could not be asked.
 */
function listTests(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [jest, '--listTests', ...args], {
      stdio: ['inherit', 'pipe', 'inherit'],
      env: { ...process.env, NODE_OPTIONS: nodeOptions },
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });

    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      // Absolute paths only. `--selectProjects` makes Jest announce "Running
      // one project: esm" on stdout alongside the list, and counting that as a
      // test file made an empty result look like a match — which granted a
      // scoped run the tolerance it was supposed to be denied.
      resolve(code === 0
        ? output.split('\n').map(line => line.trim()).filter(line => isAbsolute(line))
        : null);
    });
  });
}

/**
 * Runs each project in its own process and reports whether all of them passed.
 *
 * Every project runs even after one fails. Stopping early would be cheaper, but
 * `npm test` is CI's only test step, so a failure in the first project would
 * hide every failure in the rest until someone fixed it and pushed again — and
 * the accessibility tests this runner was built for live in the project that
 * would be skipped.
 *
 * Sequential rather than concurrent, which is a choice and not an oversight.
 * The memo that forced the split is per process, so concurrent children would
 * be equally correct — but the projects are nothing like equal (105 suites
 * against 3: 21.5s and 4.5s here, 25.5s together), so the ceiling is about four
 * seconds, and Jest already spreads its own workers across every core, so two
 * runs at once would mostly contend for the cores the first is using. Against
 * that, `stdio: 'inherit'` means concurrent runs interleave their output into
 * one terminal, which is a poor trade for a CI log someone reads to find a
 * failure.
 *
 * Coverage is written per project, because two runs would otherwise write the
 * same directory and the second would silently replace the first. A caller who
 * names their own directory keeps it — and gets that overwrite back, since
 * separate processes have nothing to merge with. It is an escape hatch for
 * pointing the output somewhere else, not a way to get one combined report;
 * there is no longer any such thing.
 * @param {string[]} args - Arguments to pass through to each run.
 * @param {string[]} projects - Project display names to run, in order.
 * @returns {Promise<number>} The first non-zero exit code, or 0.
 */
async function runProjects(args, projects) {
  const ownsCoverage = args.some(arg => arg.startsWith('--coverageDirectory'));
  let failure = 0;

  for (const project of projects) {
    console.error(`[test] project: ${project}`);
    const code = await runJest([
      ...args,
      SELECT,
      project,
      ...(ownsCoverage ? [] : ['--coverageDirectory', `coverage/${project}`]),
    ]);
    if (code !== 0 && failure === 0) {
      failure = code;
    }
  }

  return failure;
}

const { rest, selected, dangling } = takeSelection(process.argv.slice(2));
const projects = selected.length > 0 ? selected : PROJECTS;
const watching = rest.some(arg => arg === '--watch' || arg === '--watchAll');

let exitCode;
if (dangling && selected.length === 0) {
  // `--selectProjects` with nothing after it. Jest rejects it and says so, and
  // the arguments go over untouched so that error is what the caller sees —
  // the alternative is reading "named no project" as "named every project" and
  // running the lot, which is the opposite of what was asked for.
  //
  // Only when *nothing* was named, though. `--selectProjects --selectProjects
  // unit esm` leaves the flag dangling and still names two projects, and Jest
  // does not error on that — it runs both, in one process, which is the clash
  // this whole file exists to prevent. Handing those over untouched put it
  // straight back: `Must use import to load ES Module: src/type/grammar.ts`.
  exitCode = await runJest(process.argv.slice(2));
} else if (watching) {
  // A watcher does not exit, so the projects cannot be run in sequence. Rather
  // than run them together and reintroduce the clash above, watch one — the
  // caller's if they named exactly one, otherwise the project holding all but
  // a couple of suites — and say so instead of quietly narrowing.
  const project = selected.length === 1 ? selected[0] : WATCH_DEFAULT;
  if (selected.length !== 1) {
    console.error(
      `[test] watching the '${project}' project only — the projects cannot share a process.\n`
      + `[test] for another: npm run test:watch -- --selectProjects <${PROJECTS.join('|')}>`,
    );
  }
  exitCode = await runJest([...rest, SELECT, project]);
} else if (hasPathFilter(rest)) {
  // A filter is normal for one project and not the other — `npm test --
  // test/util/version.test.ts` matches nothing in `esm`, and one process per
  // project turns Jest's aggregate "at least one test found" into a per-project
  // one, so that run failed on the project that was never meant to match.
  //
  // Both lists are scoped to the projects that will actually run, so a filter
  // combined with `--selectProjects` is judged against that selection rather
  // than against the whole repository — otherwise a filter naming a `unit` file
  // would excuse an empty `esm` run that was explicitly asked for.
  //
  // Asking with `--listTests` costs two cheap resolutions, and only on a run
  // that could narrow anything. A name filter (`-t some name`) reaches here
  // too, because its value is indistinguishable from a path — and then finds
  // nothing narrowed, since `--listTests` lists files and `-t` selects tests
  // within them. Strict is the right answer for it: Jest reports a name that
  // matches nothing as skipped tests rather than as none found, so there is
  // nothing to excuse.
  const scope = selected.length > 0 ? [SELECT, ...selected] : [];
  const [matched, everything] = await Promise.all([
    listTests([...rest, ...scope]),
    listTests(scope),
  ]);
  const lenient = isNarrowed(matched, everything);
  exitCode = await runProjects(lenient ? [...rest, '--passWithNoTests'] : rest, projects);
} else {
  exitCode = await runProjects(rest, projects);
}

process.exit(exitCode);
