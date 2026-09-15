#!/usr/bin/env node

/**
 * Fetches the DotPad SDK MAIDR is pinned to, for hosts that serve it themselves.
 *
 * `maidr.js` does not bundle the SDK: its braille engine is a 14 MB liblouis
 * build, and the package would carry it for every reader to serve the few
 * with a DotPad. By default the runtime imports the vendor's published copy
 * from a CDN, pinned to a commit. This script fetches that same copy -- the
 * module, the liblouis build, and the LGPL licence and wrapper sources the
 * vendor asks redistributors to keep beside it -- verifies every file against
 * the digests in `src/service/dotPadSdk.json`, and writes them where a page can
 * serve them from its own origin:
 *
 *   window.MAIDR_DOTPAD_SDK_URL = '/dotpad/DotPadSDK-3.0.2.js';
 *   window.MAIDR_DOTPAD_ASSET_BASE_URL = '/dotpad/lib/';
 *
 * Usage: node scripts/vendor-dotpad-sdk.mjs [--out DIR] [--force]
 *
 *   --out DIR   Where to write (default: dist/dotpad). Created if missing.
 *   --force     Re-download files that are already present and correct.
 *
 * Not part of `npm run build`, and `dist/dotpad` is excluded from the npm
 * package, so the default stays small; run this only for a deployment that
 * needs the SDK offline.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_OUT_DIR,
  fileUrl,
  mismatch,
  OUTPUT_MANIFEST_NAME,
  outputManifest,
  readManifest,
} from './dotPadSdk.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * How long one file may take. Generous, because `liblouis.data` is 14 MB and
 * a slow link is not a failure; bounded, so a connection that stalls does
 * not hang the script for good.
 */
const FETCH_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * The options given on the command line.
 * @param {string[]} argv
 * @returns {{ out: string, force: boolean }} The output directory and whether to refetch
 */
function parseArgs(argv) {
  const options = { out: DEFAULT_OUT_DIR, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error('--out needs a directory');
      }
      options.out = value;
      i += 1;
    } else if (arg.startsWith('--out=')) {
      options.out = arg.slice('--out='.length);
    } else if (arg === '--force') {
      options.force = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

/**
 * The bytes already at `target` when they match `expected`, else null.
 * @param {string} target
 * @param {import('./dotPadSdk').SdkFile} expected
 * @returns {Promise<Uint8Array | null>} The valid bytes, or null
 */
async function existingIfValid(target, expected) {
  try {
    const bytes = await fs.readFile(target);
    return mismatch(bytes, expected) === null ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * Downloads one file, throwing on any HTTP or integrity failure.
 * @param {string} url
 * @param {import('./dotPadSdk').SdkFile} expected
 * @returns {Promise<Uint8Array>} The verified bytes
 */
async function download(url, expected) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const problem = mismatch(bytes, expected);
  if (problem !== null) {
    throw new Error(`${url}: ${problem}`);
  }
  return bytes;
}

async function main() {
  const { out, force } = parseArgs(process.argv.slice(2));
  const manifest = readManifest();
  const outDir = path.resolve(rootDir, out);
  await fs.mkdir(outDir, { recursive: true });

  const failures = [];
  for (const [file, expected] of Object.entries(manifest.files)) {
    const target = path.join(outDir, ...file.split('/'));
    if (!force && await existingIfValid(target, expected) !== null) {
      console.log(`up to date  ${file}`);
      continue;
    }
    const url = fileUrl(manifest, file);
    try {
      const bytes = await download(url, expected);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes);
      console.log(`fetched     ${file} (${bytes.byteLength.toLocaleString('en-US')} bytes)`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
      console.error(`failed      ${file}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} file(s) could not be vendored:`);
    for (const failure of failures) {
      console.error(`  ${failure}`);
    }
    process.exit(1);
  }

  const record = outputManifest(manifest, new Date());
  await fs.writeFile(path.join(outDir, OUTPUT_MANIFEST_NAME), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`\nDotPad SDK ${manifest.version} (${manifest.commit.slice(0, 7)}) vendored into ${path.relative(rootDir, outDir) || '.'}`);
  console.log('Point the page at it before maidr.js loads:');
  console.log(`  window.MAIDR_DOTPAD_SDK_URL = '<served path>/${manifest.module}';`);
  console.log(`  window.MAIDR_DOTPAD_ASSET_BASE_URL = '<served path>/${manifest.assetDir}';`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
