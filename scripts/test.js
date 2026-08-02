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
 * `npm test -- test/util` behave as they would with Jest directly. The one
 * exception is `--selectProjects`, which is intercepted so that naming several
 * projects still runs them one process each rather than putting them back in
 * one.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

const FLAG = '--experimental-vm-modules';

/**
 * Project display names from `jest.config.ts`, in the order they should run.
 *
 * Duplicated here because this file is plain JavaScript and the config is
 * TypeScript. `test/scripts/testRunnerProjects.test.ts` fails if the two drift.
 */
const PROJECTS = ['unit', 'esm'];

/** The project `--watch` falls back to; see below. */
const WATCH_DEFAULT = 'unit';

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
 * Removes `--selectProjects` from the arguments and returns what it named.
 *
 * Taken out rather than passed through, because the runs below add the flag
 * back one project at a time. Jest's flag is variadic, so
 * `--selectProjects unit esm` would otherwise reach a single process and
 * reintroduce the clash this file exists to avoid — silently, since Jest is
 * happy to run it.
 * @param {string[]} args - The arguments as given.
 * @returns {{rest: string[], selected: string[]}} Arguments without the flag,
 * and the project names it named.
 */
function takeSelection(args) {
  const rest = [];
  const selected = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg.startsWith('--selectProjects=')) {
      selected.push(arg.slice('--selectProjects='.length));
    } else if (arg === '--selectProjects') {
      // Variadic: every following value up to the next flag belongs to it.
      while (index + 1 < args.length && !args[index + 1].startsWith('-')) {
        index++;
        selected.push(args[index]);
      }
    } else {
      rest.push(arg);
    }
  }

  return { rest, selected };
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
 * Coverage is written per project, because two runs would otherwise write the
 * same directory and the second would silently replace the first. A caller who
 * names their own directory keeps it, and gets one report.
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
      '--selectProjects',
      project,
      ...(ownsCoverage ? [] : ['--coverageDirectory', `coverage/${project}`]),
    ]);
    if (code !== 0 && failure === 0) {
      failure = code;
    }
  }

  return failure;
}

const { rest, selected } = takeSelection(process.argv.slice(2));
const projects = selected.length > 0 ? selected : PROJECTS;
const watching = rest.some(arg => arg === '--watch' || arg === '--watchAll');

let exitCode;
if (watching) {
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
  exitCode = await runJest([...rest, '--selectProjects', project]);
} else {
  exitCode = await runProjects(rest, projects);
}

process.exit(exitCode);
