/**
 * Programmatic build runner for MAIDR library.
 *
 * Consolidates all Vite build configurations into a single file.
 *
 * The bundles are fully independent, so by default the orchestrator builds
 * them in parallel across several child processes. Running each build in its
 * own process sidesteps the vite-plugin-dts shared-state limitation that used
 * to force serial builds (its temp/rollup state is per-process), while making
 * use of all available CPU cores.
 *
 * Usage: node scripts/build.js [name ...] [--sequential] [--jobs=N]
 *
 * With no arguments, all bundles are built. Passing bundle names (e.g.
 * `node scripts/build.js core react`) builds only those bundles; selective
 * builds never empty the output directory.
 *
 * Flags:
 *   --sequential   Build one bundle at a time, in-process (legacy behaviour).
 *   --jobs=N       Cap the number of concurrent build processes (default:
 *                  based on CPU count). Also settable via MAIDR_BUILD_JOBS.
 */

import { fork } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { build } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Common path aliases
const baseAliases = {
  '@adapters': path.resolve(rootDir, 'src/adapters'),
  '@command': path.resolve(rootDir, 'src/command'),
  '@model': path.resolve(rootDir, 'src/model'),
  '@state': path.resolve(rootDir, 'src/state'),
  '@service': path.resolve(rootDir, 'src/service'),
  '@type': path.resolve(rootDir, 'src/type'),
  '@ui': path.resolve(rootDir, 'src/ui'),
  '@util': path.resolve(rootDir, 'src/util'),
};

const adapterAliases = {
  ...baseAliases,
  '@adapters': path.resolve(rootDir, 'src/adapters'),
};

/**
 * Empty a directory's contents without removing the directory itself. Removing
 * the dir outright can EPERM on Windows (OneDrive sync, AV scanners, or a
 * lingering handle on the folder), so we clear children instead — this mirrors
 * Vite's own emptyOutDir behaviour.
 */
async function emptyDir(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT')
      return;
    throw err;
  }
  await Promise.all(entries.map(e =>
    fs.rm(path.join(dir, e.name), { recursive: true, force: true })));
}

/**
 * Byte-compare two files (cheap size check first, then contents).
 */
async function filesEqual(a, b) {
  const [statA, statB] = await Promise.all([fs.stat(a), fs.stat(b)]);
  if (statA.size !== statB.size)
    return false;
  const [bufA, bufB] = await Promise.all([fs.readFile(a), fs.readFile(b)]);
  return bufA.equals(bufB);
}

/**
 * Pick a default worker count that works across a wide range of dev machines.
 *
 * The build is bottlenecked by ~7 heavy React + vite-plugin-dts bundles, each
 * of which holds ~1.75 GB during the api-extractor type rollup. So we cap by
 * three things and take the smallest:
 *   - CPU: ~2/3 of available cores keeps them busy without oversubscribing the
 *     dts/esbuild work (which slows every build via contention past that).
 *   - RAM: ~1.75 GB per concurrent build with ~1.5 GB held in reserve — this is
 *     what keeps low-memory laptops (e.g. 8 GB) from OOM-ing. On very tight
 *     machines the cap can drop all the way to a single worker.
 *   - A hard ceiling of 8: there are only ~7-8 heavy bundles, so more workers
 *     than that never shortens the wall clock on any machine.
 * Override with --jobs=N or MAIDR_BUILD_JOBS when you know your hardware.
 *
 * The 2/3, 1.75 GB and 1.5 GB constants were tuned empirically against the
 * current bundle set — retune them if bundles get heavier or more numerous.
 */
function defaultJobs() {
  // availableParallelism honours container/cgroup CPU limits where cpus()
  // reports the host's cores (Node >= 18.14; fall back for older runtimes).
  const cores = os.availableParallelism?.() ?? os.cpus().length;
  const cpuCap = Math.round(cores * 2 / 3);
  // Unlike availableParallelism, totalmem() is NOT cgroup-aware: it reports
  // the host's physical RAM, so a memory-limited container can still
  // over-provision. Set MAIDR_BUILD_JOBS/--jobs explicitly in that case.
  const memGb = os.totalmem() / 1024 ** 3;
  const memCap = Math.floor((memGb - 1.5) / 1.75);
  return Math.max(1, Math.min(8, cpuCap, memCap));
}

/**
 * Parse a user-supplied job count. A malformed value must abort the build:
 * left unchecked it flows as NaN into the worker pool, where
 * `Array.from({ length: NaN })` yields an empty array and the script would
 * report success having built nothing.
 */
function parseJobs(raw, source) {
  // Number(), not parseInt(): parseInt stops at the first non-digit, so a
  // value like "4x" would silently parse as 4 instead of being rejected.
  const jobs = Number(raw);
  if (!Number.isInteger(jobs) || jobs < 1) {
    console.error(`Invalid ${source} value: "${raw}" — expected a positive integer.`);
    process.exit(1);
  }
  return jobs;
}

function onWarn(warning, warn) {
  if (warning.code === 'MODULE_LEVEL_DIRECTIVE' || warning.code === 'SOURCEMAP_ERROR') {
    return;
  }
  warn(warning);
}

/**
 * Build configurations
 */
const builds = [
  {
    name: 'core',
    entry: 'src/index.tsx',
    libName: 'maidr',
    formats: ['es', 'umd'],
    fileName: () => 'maidr.js',
    emptyOutDir: true,
    external: [],
    useReact: true,
    useDts: false,
    aliases: baseAliases,
  },
  {
    name: 'react',
    entry: 'src/react-entry.ts',
    formats: ['es'],
    fileName: () => 'react.mjs',
    emptyOutDir: false,
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    useReact: true,
    useDts: true,
    aliases: baseAliases,
  },
  {
    name: 'recharts',
    entry: 'src/recharts-entry.ts',
    formats: ['es'],
    fileName: () => 'recharts.mjs',
    emptyOutDir: false,
    external: ['react', 'react-dom', 'react/jsx-runtime', 'recharts'],
    useReact: true,
    useDts: true,
    aliases: adapterAliases,
  },
  {
    name: 'google-charts',
    entry: 'src/google-charts-entry.ts',
    libName: 'maidrGoogleCharts',
    formats: ['es', 'umd'],
    fileName: format => format === 'es' ? 'google-charts.mjs' : 'google-charts.js',
    emptyOutDir: false,
    external: [],
    useReact: false,
    useDts: true,
    aliases: {
      '@adapters': path.resolve(rootDir, 'src/adapters'),
      '@type': path.resolve(rootDir, 'src/type'),
    },
  },
  {
    name: 'frappe',
    entry: 'src/frappe-entry.ts',
    libName: 'maidrFrappe',
    formats: ['es', 'umd'],
    fileName: format => format === 'es' ? 'frappe.mjs' : 'frappe.js',
    emptyOutDir: false,
    external: [],
    useReact: false,
    useDts: true,
    aliases: {
      '@adapters': path.resolve(rootDir, 'src/adapters'),
      '@type': path.resolve(rootDir, 'src/type'),
    },
  },
  {
    name: 'd3',
    entry: 'src/adapters/d3/index.ts',
    libName: 'maidrD3',
    formats: ['es', 'umd'],
    fileName: format => format === 'es' ? 'd3.mjs' : 'd3.js',
    emptyOutDir: false,
    external: [],
    useReact: false,
    useDts: true,
    aliases: {
      '@adapters': path.resolve(rootDir, 'src/adapters'),
      '@type': path.resolve(rootDir, 'src/type'),
    },
  },
  {
    name: 'highcharts',
    entry: 'src/adapters/highcharts/index.ts',
    libName: 'maidrHighcharts',
    formats: ['es', 'umd'],
    fileName: format => format === 'es' ? 'highcharts.mjs' : 'highcharts.js',
    emptyOutDir: false,
    external: [],
    useReact: false,
    useDts: true,
    aliases: {
      '@adapters': path.resolve(rootDir, 'src/adapters'),
      '@type': path.resolve(rootDir, 'src/type'),
    },
  },
  {
    name: 'vegalite',
    entry: 'src/vegalite-entry.ts',
    libName: 'maidrVegaLite',
    formats: ['es', 'umd'],
    fileName: format => format === 'es' ? 'vegalite.mjs' : 'vegalite.js',
    emptyOutDir: false,
    external: [],
    useReact: true,
    useDts: true,
    aliases: adapterAliases,
  },
  {
    name: 'chartjs',
    entry: 'src/adapters/chartjs/index.ts',
    libName: 'maidrChartjs',
    formats: ['es', 'umd'],
    fileName: format => format === 'es' ? 'chartjs.mjs' : 'chartjs.js',
    emptyOutDir: false,
    // React is bundled in (mirrors d3/google-charts UMD strategy) so the UMD
    // build can be loaded via classic <script> tags from file:// URLs.
    // Chart.js stays external — host pages always load it themselves.
    external: ['chart.js', 'chart.js/auto'],
    useReact: true,
    useDts: true,
    aliases: adapterAliases,
  },
  {
    name: 'amcharts',
    entry: 'src/adapters/amcharts/index.ts',
    libName: 'maidrAmCharts',
    formats: ['es', 'umd'],
    fileName: format => format === 'es' ? 'amcharts.mjs' : 'amcharts.js',
    emptyOutDir: false,
    // `bindAmCharts` mounts the MAIDR React UI over the chart, so React is
    // bundled in (mirrors chartjs/d3) and the UMD build (amcharts.js) exposes
    // the `maidrAmCharts` global for classic <script> use from file://.
    // amCharts itself is never imported (it's duck-typed off the live objects
    // passed in), so there is nothing to externalize.
    external: [],
    useReact: true,
    useDts: true,
    aliases: adapterAliases,
  },
  {
    name: 'victory',
    entry: 'src/victory-entry.ts',
    formats: ['es'],
    fileName: () => 'victory.mjs',
    emptyOutDir: false,
    external: ['react', 'react-dom', 'react/jsx-runtime', 'victory'],
    useReact: true,
    useDts: true,
    aliases: adapterAliases,
  },
  {
    name: 'anychart',
    entry: 'src/anychart-entry.ts',
    libName: 'maidrAnyChart',
    formats: ['es', 'umd'],
    fileName: format => format === 'es' ? 'anychart.mjs' : 'anychart.js',
    emptyOutDir: false,
    // AnyChart is loaded separately on the host page; do not bundle it.
    external: ['anychart'],
    useReact: false,
    useDts: true,
    aliases: {
      '@adapters': path.resolve(rootDir, 'src/adapters'),
      '@type': path.resolve(rootDir, 'src/type'),
    },
  },
];

function createViteConfig(config) {
  const plugins = [];
  if (config.useReact)
    plugins.push(react());
  if (config.useDts) {
    plugins.push(dts({
      tsconfigPath: './tsconfig.build.json',
      rollupTypes: true,
      insertTypesEntry: false,
    }));
  }

  // Workers build into an isolated outDir (passed via env) so parallel
  // vite-plugin-dts runs never clobber each other's intermediate .d.ts files
  // in the shared dist directory. vite-plugin-dts follows build.outDir —
  // that assumption is load-bearing for the parallel build, so re-verify it
  // (default output byte-identical to --sequential) when bumping the plugin.
  const outDir = process.env.MAIDR_BUILD_OUTDIR || 'dist';

  return {
    configFile: false,
    root: rootDir,
    plugins,
    build: {
      lib: {
        entry: path.resolve(rootDir, config.entry),
        name: config.libName,
        formats: config.formats,
        fileName: config.fileName,
      },
      sourcemap: true,
      outDir,
      emptyOutDir: config.emptyOutDir,
      rollupOptions: { external: config.external, onwarn: onWarn },
    },
    define: { 'process.env': {} },
    resolve: { alias: config.aliases },
  };
}

/**
 * Build a single bundle in-process. Used both by the legacy sequential path
 * and by each forked worker process.
 */
async function buildOne(config) {
  await build(createViteConfig(config));
}

/**
 * Run the selected builds one at a time in this process (legacy behaviour).
 */
async function runSequential(selected) {
  for (let i = 0; i < selected.length; i++) {
    const config = selected[i];
    const step = `[${i + 1}/${selected.length}]`;
    console.log(`${step} Building ${config.name}...`);

    const t = Date.now();
    await buildOne(config);
    console.log(`${step} Done (${((Date.now() - t) / 1000).toFixed(1)}s)\n`);
  }
}

/**
 * Fork one worker per bundle and run up to `jobs` at a time. Each worker
 * builds a single bundle in its own process, so vite-plugin-dts state never
 * collides across builds.
 */
async function runParallel(selected, jobs, outDir) {
  const scriptPath = fileURLToPath(import.meta.url);
  const total = selected.length;
  let started = 0;
  const activeChildren = new Set();
  // Filenames merged into dist this run, keyed to the bundle that emitted
  // them — lets us detect two bundles emitting the same name (see below).
  const mergedBy = new Map();
  // Merges are serialized through this promise chain: they're just a few
  // renames (milliseconds next to the builds they follow), and running them
  // one at a time keeps the duplicate/collision bookkeeping race-free.
  let mergeLock = Promise.resolve();

  const mergeOutput = async (config, workerOut) => {
    const entries = await fs.readdir(workerOut, { withFileTypes: true });
    for (const e of entries) {
      const src = path.join(workerOut, e.name);
      const dest = path.join(outDir, e.name);
      const emitter = mergedBy.get(e.name);
      if (emitter !== undefined) {
        // Some outputs are legitimately emitted by several bundles: every
        // React-based bundle writes an identical shared maidr.css. Keep the
        // first copy when contents are byte-identical, and fail only on a
        // genuine conflict — fs.rename would otherwise silently replace the
        // existing file and corrupt another bundle's artifact. Deliberately
        // conservative: same-named directories always conflict, since no
        // bundle emits them today and deep-comparing them is untested.
        if (e.isFile() && await filesEqual(src, dest))
          continue;
        throw new Error(
          `Merge collision: "${config.name}" and "${emitter}" emitted different contents for "${e.name}"`,
        );
      }
      mergedBy.set(e.name, config.name);
      // Stale copies from an earlier build are expected in selective builds
      // (dist isn't emptied); clear them first so a directory rename can't
      // fail with ENOTEMPTY.
      await fs.rm(dest, { recursive: true, force: true });
      await fs.rename(src, dest);
    }
    await fs.rm(workerOut, { recursive: true, force: true });
  };

  const runWorker = config => new Promise((resolve, reject) => {
    const step = `[${++started}/${total}]`;
    console.log(`${step} Building ${config.name}...`);
    const t = Date.now();

    // Each worker gets an isolated outDir so parallel dts rollups don't
    // collide; the final artifacts are merged into dist below.
    const workerOut = path.join(outDir, '.tmp', config.name);

    const child = fork(scriptPath, [config.name], {
      // MAIDR_BUILD_WORKER makes the child build in-process instead of
      // re-orchestrating. MAIDR_BUILD_OUTDIR isolates its output directory.
      env: { ...process.env, MAIDR_BUILD_WORKER: '1', MAIDR_BUILD_OUTDIR: workerOut },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    activeChildren.add(child);

    child.on('error', (err) => {
      activeChildren.delete(child);
      reject(err);
    });
    child.on('exit', async (code, signal) => {
      activeChildren.delete(child);
      if (code !== 0) {
        const cause = signal ? `terminated by ${signal}` : `exit code ${code}`;
        reject(new Error(`Build "${config.name}" failed (${cause})`));
        return;
      }
      try {
        const merge = mergeLock.then(() => mergeOutput(config, workerOut));
        mergeLock = merge.catch(() => {});
        await merge;
        console.log(`${step} Done ${config.name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });

  // Simple concurrency pool: keep `jobs` workers in flight. On the first
  // failure stop dequeuing and kill in-flight siblings, so a broken build
  // doesn't leave orphaned processes chewing CPU/RAM after the parent exits.
  const queue = [...selected];
  let firstError = null;
  const workers = Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length > 0 && firstError === null) {
      try {
        await runWorker(queue.shift());
      } catch (err) {
        firstError ??= err;
        for (const child of activeChildren)
          child.kill('SIGTERM');
      }
    }
  });
  // Defense-in-depth for Ctrl+C / kill: shells usually signal the whole
  // foreground process group, but that isn't guaranteed everywhere (notably
  // Windows), so make sure an interrupted build doesn't leave workers running.
  // Best-effort by design: exit() neither waits for the children to die nor
  // runs main()'s finally cleanup — the next non-worker run sweeps dist/.tmp.
  const onSignal = (signal) => {
    for (const child of activeChildren)
      child.kill('SIGTERM');
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  try {
    await Promise.all(workers);
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
  if (firstError)
    throw firstError;
}

async function main() {
  const startTime = Date.now();

  const argv = process.argv.slice(2);
  const sequential = argv.includes('--sequential');
  const jobsArg = argv.find(a => a.startsWith('--jobs='));
  const requested = argv.filter(a => !a.startsWith('--'));

  if (argv.includes('--jobs')) {
    console.error('--jobs requires a value, e.g. --jobs=4');
    process.exit(1);
  }
  // A mistyped flag must not silently fall through to the default behaviour
  // (e.g. `--sequental` quietly running a full parallel build).
  const unknownFlags = argv.filter(a =>
    a.startsWith('--') && a !== '--sequential' && !a.startsWith('--jobs='));
  if (unknownFlags.length > 0) {
    console.error(`Unknown flag(s): ${unknownFlags.join(', ')}`);
    console.error('Supported flags: --sequential, --jobs=N');
    process.exit(1);
  }

  const unknown = requested.filter(name => !builds.some(b => b.name === name));
  if (unknown.length > 0) {
    console.error(`Unknown bundle name(s): ${unknown.join(', ')}`);
    console.error(`Available: ${builds.map(b => b.name).join(', ')}`);
    process.exit(1);
  }

  const isWorker = process.env.MAIDR_BUILD_WORKER === '1';

  // Sweep stale worker temp output on every non-worker invocation — a
  // crashed or interrupted parallel build can leave dist/.tmp behind, and
  // `files: ["dist"]` would ship it via npm pack. Workers must NOT do this:
  // they run concurrently, and dist/.tmp holds their siblings' output.
  // As with the old serial build, concurrent invocations of this script
  // against the same checkout are unsupported — this sweep (and the dist
  // merges later) would race with the other run's in-flight output.
  if (!isWorker)
    await fs.rm(path.resolve(rootDir, 'dist', '.tmp'), { recursive: true, force: true });

  const selected = requested.length > 0
    ? builds
        .filter(b => requested.includes(b.name))
        // Selective builds must not wipe the other bundles from dist.
        .map(b => ({ ...b, emptyOutDir: false }))
    : builds;

  // Resolve the job cap early: before the sequential-path branch (a cap of 1
  // routes there) and before emptying dist, so a malformed
  // --jobs/MAIDR_BUILD_JOBS aborts without wiping previous build output.
  const jobs = jobsArg
    ? parseJobs(jobsArg.slice('--jobs='.length), '--jobs')
    : process.env.MAIDR_BUILD_JOBS
      ? parseJobs(process.env.MAIDR_BUILD_JOBS, 'MAIDR_BUILD_JOBS')
      : defaultJobs();

  // Worker processes (and single-bundle requests) just build in-process. A
  // job cap of 1 gains nothing from forking, so it goes in-process too
  // instead of paying per-bundle child startup.
  if (isWorker || sequential || jobs === 1 || selected.length === 1) {
    if (!isWorker)
      console.log('Building MAIDR library...\n');
    await runSequential(selected);
    if (!isWorker)
      console.log(`All builds complete in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    return;
  }

  // Parent orchestrator: empty dist once up front, then fork workers. Children
  // build into isolated temp dirs and the parent merges results into dist.
  const outDir = path.resolve(rootDir, 'dist');
  const shouldEmpty = selected.some(b => b.emptyOutDir);
  if (shouldEmpty)
    await emptyDir(outDir);
  // Ensure dist exists for merges to land into (.tmp was swept above).
  await fs.mkdir(outDir, { recursive: true });
  const workerBuilds = selected.map(b => ({ ...b, emptyOutDir: false }));

  console.log(`Building MAIDR library (${workerBuilds.length} bundles, up to ${jobs} in parallel)...\n`);
  try {
    await runParallel(workerBuilds, jobs, outDir);
  } finally {
    // Clean up .tmp on success AND failure — `files: ["dist"]` in package.json
    // means anything left under dist/ would end up in the published package.
    // Best-effort so a cleanup error can't mask a real build failure.
    await fs.rm(path.join(outDir, '.tmp'), { recursive: true, force: true })
      .catch(() => {});
  }

  console.log(`\nAll builds complete in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
