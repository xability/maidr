/**
 * What `scripts/vendor-dotpad-sdk.mjs` needs to know about the DotPad SDK,
 * separated from the download itself so it can be tested without a network.
 *
 * The single source of truth is `src/service/dotPadSdk.json`: the runtime
 * imports it for the URL it loads the SDK from, and the vendoring script reads
 * it for the same URL plus the digest of every file. One record, so the copy
 * a host serves itself cannot drift from the copy MAIDR would have fetched.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Where the manifest lives, relative to the repository root. */
export const MANIFEST_PATH = path.resolve(__dirname, '../src/service/dotPadSdk.json');

/** Where `npm run vendor:dotpad` writes by default, relative to the root. */
export const DEFAULT_OUT_DIR = 'dist/dotpad';

/** The name of the record written beside the vendored files. */
export const OUTPUT_MANIFEST_NAME = 'manifest.json';

/**
 * The name the build publishes the manifest under in `dist/`, so the npm
 * package carries it and the Python and R bindings and the skill can copy
 * their pins from `dist/dotpad-sdk.json` when they refresh the bundle.
 */
export const DIST_MANIFEST_NAME = 'dotpad-sdk.json';

/**
 * Reads the manifest from disk.
 * @returns {import('./dotPadSdk').SdkManifest} The parsed manifest
 */
export function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

/**
 * Copies the manifest into the build output.
 * @param {string} distDir - The directory `npm run build` writes to
 * @returns {string} The path written
 */
export function publishManifest(distDir) {
  const target = path.join(distDir, DIST_MANIFEST_NAME);
  fs.mkdirSync(distDir, { recursive: true });
  fs.copyFileSync(MANIFEST_PATH, target);
  return target;
}

/**
 * The URL a manifest entry is fetched from.
 * @param {import('./dotPadSdk').SdkManifest} manifest
 * @param {string} file - A key of `manifest.files`
 * @returns {string} The file's URL at the pinned commit
 */
export function fileUrl(manifest, file) {
  return `${manifest.baseUrl}${file}`;
}

/**
 * Why `bytes` is not the file the manifest describes, or null when it is.
 *
 * Size is checked first because it is the failure with a story: the corrupt
 * `liblouis.data` that motivated the pin was 7,685 bytes short, and a size
 * says so where a digest only says "different".
 *
 * Both digests are checked. SHA-256 is the one that matters here; MD5 is in
 * the manifest because the R binding verifies its copy with `tools::md5sum`,
 * base R having no SHA-256, and checking it here too is what keeps a re-pin
 * from recording an MD5 that R would then reject.
 *
 * @param {Uint8Array} bytes
 * @param {import('./dotPadSdk').SdkFile} expected
 * @returns {string | null} What differs, or null when nothing does
 */
export function mismatch(bytes, expected) {
  if (bytes.byteLength !== expected.bytes) {
    return `expected ${expected.bytes} bytes, got ${bytes.byteLength}`;
  }
  for (const algorithm of ['sha256', 'md5']) {
    const digest = createHash(algorithm).update(bytes).digest('hex');
    if (digest !== expected[algorithm]) {
      return `expected ${algorithm} ${expected[algorithm]}, got ${digest}`;
    }
  }
  return null;
}

/**
 * The record written beside the vendored files: the manifest, plus when the
 * bytes were fetched, so a copy found on a server can be traced to a commit.
 *
 * @param {import('./dotPadSdk').SdkManifest} manifest
 * @param {Date} retrieved
 * @returns {import('./dotPadSdk').VendoredManifest} The manifest with a `retrieved` date
 */
export function outputManifest(manifest, retrieved) {
  return { ...manifest, retrieved: retrieved.toISOString().slice(0, 10) };
}
