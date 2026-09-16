#!/usr/bin/env node

/**
 * Moves the DotPad SDK pin to a new release, or checks whether one is due.
 *
 * `src/service/dotPadSdk.json` is the one record of where `maidr.js` loads
 * the vendor SDK from and what every file's bytes must be. This script is
 * how that record changes, and it never trusts anything it did not verify
 * against the vendor's own release archive.
 *
 * The vendor publishes each release in its repository as
 * `Web/<version>/download/web-sdk-<version>.zip`. A CDN cannot serve a file
 * from inside an archive, so the files MAIDR loads at runtime live extracted
 * in a mirror, `xability/dotpad-sdk-guide`, pinned by commit. Moving the pin
 * is therefore two steps, with a commit to the mirror between them:
 *
 *   1. node scripts/repin-dotpad-sdk.mjs --version 3.0.3 --extract-to ../dotpad-sdk-guide
 *      Downloads the vendor's archive for that version, verifies it is an
 *      archive and not an error page, and extracts it into the mirror
 *      checkout under `Web/<version>/`. Commit that to the mirror's default
 *      branch (a branch that is deleted is eventually garbage-collected, and
 *      an unreachable commit is a URL that starts returning 404).
 *
 *   2. node scripts/repin-dotpad-sdk.mjs --version 3.0.3 --mirror-commit <sha>
 *      Downloads the archive again, fetches every runtime file from the
 *      mirror at that commit, and refuses to write the manifest unless each
 *      one is byte-identical to the archive's. Then rewrites the manifest
 *      with the new base URL, the digests, and the archive's provenance.
 *
 * And the check the weekly workflow runs:
 *
 *   node scripts/repin-dotpad-sdk.mjs --check
 *      Reads the vendor's `Web/releases.json` and exits 1 when it names a
 *      release the manifest does not pin, printing what to run.
 *
 * `--upstream-commit <sha>` pins which commit of the vendor's repository the
 * archive is read from; the default is the head of its `main`, resolved
 * through the GitHub API. Only the standard library is used; the archive is
 * read with node's own zlib.
 */

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { MANIFEST_PATH, readManifest } from './dotPadSdk.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const UPSTREAM_REPOSITORY = 'https://github.com/dotincorp/dotpad-sdk-guide';
const UPSTREAM_GH = 'dotincorp/dotpad-sdk-guide';
const MIRROR_REPOSITORY = 'https://github.com/xability/dotpad-sdk-guide';
const MIRROR_GH = 'xability/dotpad-sdk-guide';
const FETCH_TIMEOUT_MS = 5 * 60 * 1000;

/** The vendor's directory for a release, relative to the repository root. */
const releaseDir = version => `Web/${version}/`;
/** The vendor's archive for a release, relative to the repository root. */
const archivePath = version => `${releaseDir(version)}download/web-sdk-${version}.zip`;
/** jsDelivr's URL for a file at a commit of a GitHub repository. */
const cdnUrl = (repo, commit, file) => `https://cdn.jsdelivr.net/gh/${repo}@${commit}/${file}`;

/**
 * The options given on the command line.
 * @param {string[]} argv
 * @returns {{ check: boolean, version: string | null, extractTo: string | null, mirrorCommit: string | null, upstreamCommit: string | null }} The parsed options
 */
function parseArgs(argv) {
  const options = { check: false, version: null, extractTo: null, mirrorCommit: null, upstreamCommit: null };
  const takesValue = { '--version': 'version', '--extract-to': 'extractTo', '--mirror-commit': 'mirrorCommit', '--upstream-commit': 'upstreamCommit' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    if (name === '--check') {
      options.check = true;
    } else if (name in takesValue) {
      const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
      if (value === undefined) {
        throw new Error(`${name} needs a value`);
      }
      options[takesValue[name]] = value;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

/**
 * Fetches a URL in full, failing on any HTTP error.
 * @param {string} url
 * @returns {Promise<Uint8Array>} The response body
 */
async function fetchBytes(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Fetches and parses JSON.
 * @param {string} url
 * @param {Record<string, string>} [headers]
 * @returns {Promise<any>} The parsed document
 */
async function fetchJson(url, headers = {}) {
  return JSON.parse(new TextDecoder().decode(await fetchBytes(url, headers)));
}

/**
 * The head commit of the vendor repository's default branch, from the GitHub
 * API. `GITHUB_TOKEN` is sent when set so the weekly workflow is not subject
 * to the anonymous rate limit.
 * @returns {Promise<string>} A full commit SHA
 */
async function upstreamHead() {
  const token = process.env.GITHUB_TOKEN;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const commit = await fetchJson(`https://api.github.com/repos/${UPSTREAM_GH}/commits/main`, headers);
  if (typeof commit.sha !== 'string' || !/^[0-9a-f]{40}$/.test(commit.sha)) {
    throw new TypeError('could not resolve the head of the vendor repository');
  }
  return commit.sha;
}

/**
 * The release the vendor currently names as the product version.
 * @param {string} commit - The vendor commit to read `Web/releases.json` at
 * @returns {Promise<string>} The version, without a leading `v`
 */
async function upstreamVersion(commit) {
  const releases = await fetchJson(cdnUrl(UPSTREAM_GH, commit, 'Web/releases.json'));
  const version = releases?.product?.version;
  if (typeof version !== 'string') {
    throw new TypeError('Web/releases.json names no product version');
  }
  return version.replace(/^v/, '');
}

/**
 * Reads a zip archive held in memory.
 *
 * Enough of the format for the vendor's archives: the end-of-central-directory
 * record, the central directory, and entries stored raw or deflated. No
 * zip64, no encryption, no data descriptors on the central entries.
 *
 * @param {Uint8Array} bytes
 * @returns {Map<string, Uint8Array>} Each file's path and contents; directories are omitted
 */
export function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 0xFFFF; i -= 1) {
    if (view.getUint32(i, true) === 0x06054B50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) {
    throw new Error('not a zip archive (no end-of-central-directory record)');
  }
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files = new Map();
  for (let n = 0; n < entryCount; n += 1) {
    if (view.getUint32(offset, true) !== 0x02014B50) {
      throw new Error('corrupt zip archive (bad central directory entry)');
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) {
      continue;
    }
    if (view.getUint32(localOffset, true) !== 0x04034B50) {
      throw new Error(`corrupt zip archive (bad local header for ${name})`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    let contents;
    if (method === 0) {
      contents = data;
    } else if (method === 8) {
      contents = new Uint8Array(zlib.inflateRawSync(data));
    } else {
      throw new Error(`unsupported compression method ${method} for ${name}`);
    }
    if (contents.byteLength !== size) {
      throw new Error(`${name}: expected ${size} bytes, got ${contents.byteLength}`);
    }
    files.set(name, contents);
  }
  return files;
}

/**
 * The files MAIDR loads at runtime from a release, in manifest order: the
 * module, then everything under `lib/`. The `.d.ts` is left out; it goes to
 * the mirror for anyone reading the SDK's types, but nothing fetches it.
 *
 * @param {Map<string, Uint8Array>} archive
 * @param {string} version
 * @returns {string[]} Paths relative to the release directory
 */
export function runtimeFiles(archive, version) {
  const module = `DotPadSDK-${version}.js`;
  if (!archive.has(module)) {
    throw new Error(`the archive holds no ${module}`);
  }
  const lib = [...archive.keys()].filter(name => name.startsWith('lib/')).sort();
  for (const required of ['lib/liblouis.js', 'lib/liblouis.wasm', 'lib/liblouis.data']) {
    if (!lib.includes(required)) {
      throw new Error(`the archive holds no ${required}`);
    }
  }
  return [module, ...lib];
}

/**
 * The digests the manifest records for a file.
 * @param {Uint8Array} bytes
 * @returns {{ bytes: number, sha256: string, md5: string }} The record
 */
function describe(bytes) {
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    md5: createHash('md5').update(bytes).digest('hex'),
  };
}

/**
 * Downloads and opens the vendor's archive for a release.
 * @param {string} version
 * @param {string} upstreamCommit
 * @returns {Promise<{ archive: Map<string, Uint8Array>, sha256: string }>} Its files and digest
 */
async function fetchArchive(version, upstreamCommit) {
  const url = cdnUrl(UPSTREAM_GH, upstreamCommit, archivePath(version));
  console.log(`fetching ${url}`);
  const bytes = await fetchBytes(url);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { archive: readZip(bytes), sha256 };
}

/**
 * Step one: lay the archive out in a mirror checkout.
 * @param {string} version
 * @param {string} upstreamCommit
 * @param {string} extractTo - The mirror checkout
 */
async function extract(version, upstreamCommit, extractTo) {
  const { archive, sha256 } = await fetchArchive(version, upstreamCommit);
  const target = path.resolve(rootDir, extractTo, releaseDir(version));
  for (const [name, contents] of archive) {
    const file = path.join(target, ...name.split('/'));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, contents);
    console.log(`extracted   ${name} (${contents.byteLength.toLocaleString('en-US')} bytes)`);
  }
  console.log(`\nWeb SDK ${version} (archive sha256 ${sha256}) is laid out in ${target}`);
  console.log('Commit that to the mirror\'s default branch, then run:');
  console.log(`  node scripts/repin-dotpad-sdk.mjs --version ${version} --mirror-commit <sha> --upstream-commit ${upstreamCommit}`);
}

/**
 * Step two: verify the mirror against the archive and write the manifest.
 * @param {string} version
 * @param {string} upstreamCommit
 * @param {string} mirrorCommit
 */
async function pin(version, upstreamCommit, mirrorCommit) {
  if (!/^[0-9a-f]{40}$/.test(mirrorCommit)) {
    throw new Error('--mirror-commit must be a full 40-character SHA');
  }
  const { archive, sha256 } = await fetchArchive(version, upstreamCommit);
  const files = {};
  for (const name of runtimeFiles(archive, version)) {
    const expected = archive.get(name);
    const url = cdnUrl(MIRROR_GH, mirrorCommit, `${releaseDir(version)}${name}`);
    const served = await fetchBytes(url);
    if (Buffer.compare(Buffer.from(served), Buffer.from(expected)) !== 0) {
      throw new Error(`${url} is not the archive's ${name}: the mirror does not carry the vendor's bytes`);
    }
    files[name] = describe(expected);
    console.log(`verified    ${name} (${expected.byteLength.toLocaleString('en-US')} bytes)`);
  }
  const manifest = {
    version,
    repository: MIRROR_REPOSITORY,
    commit: mirrorCommit,
    baseUrl: cdnUrl(MIRROR_GH, mirrorCommit, releaseDir(version)),
    upstream: {
      repository: UPSTREAM_REPOSITORY,
      commit: upstreamCommit,
      archive: archivePath(version),
      sha256,
    },
    module: `DotPadSDK-${version}.js`,
    assetDir: 'lib/',
    files,
  };
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n${path.relative(rootDir, MANIFEST_PATH)} now pins DotPad SDK ${version} at ${MIRROR_GH}@${mirrorCommit.slice(0, 7)}`);
  console.log('Run the tests, then commit the manifest.');
}

/**
 * The weekly question: does the vendor name a release the manifest does not?
 * @returns {Promise<boolean>} True when the pin is current
 */
async function check() {
  const manifest = readManifest();
  // Without the API (no network policy for it, or rate limited) jsDelivr still
  // serves the branch tip, only without telling us its commit.
  const head = await upstreamHead().catch((error) => {
    console.warn(`${error.message}; reading the vendor's default branch through the CDN instead`);
    return 'main';
  });
  const latest = await upstreamVersion(head);
  if (latest === manifest.version) {
    console.log(`DotPad SDK ${manifest.version} is the vendor's current release; the pin is up to date.`);
    return true;
  }
  console.log(`The vendor's current Web SDK release is ${latest}; the manifest pins ${manifest.version}.`);
  console.log('To move the pin:');
  console.log(`  node scripts/repin-dotpad-sdk.mjs --version ${latest} --upstream-commit ${head} --extract-to <mirror checkout>`);
  console.log('  (commit the extracted release to xability/dotpad-sdk-guide, then)');
  console.log(`  node scripts/repin-dotpad-sdk.mjs --version ${latest} --upstream-commit ${head} --mirror-commit <sha>`);
  return false;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.check) {
    process.exit(await check() ? 0 : 1);
  }
  if (options.version === null) {
    throw new Error('--version is required (or --check)');
  }
  const upstreamCommit = options.upstreamCommit ?? await upstreamHead();
  if (options.extractTo !== null) {
    await extract(options.version, upstreamCommit, options.extractTo);
  } else if (options.mirrorCommit !== null) {
    await pin(options.version, upstreamCommit, options.mirrorCommit);
  } else {
    throw new Error('give --extract-to <mirror checkout> or --mirror-commit <sha>');
  }
}

// Only run as a CLI; the parser and archive reader are imported by the tests.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
