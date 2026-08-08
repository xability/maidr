import packageJson from '../../package.json';

/**
 * Version of the maidr.js bundle that is currently running.
 *
 * Read from `package.json`, which semantic-release owns, so the value always
 * matches the published release without a second source of truth to keep in
 * sync. Bundlers inline the field at build time, so nothing is read at runtime.
 *
 * Imported as a default rather than as `{ version }`. Named exports from a JSON
 * module are a bundler convenience, not part of ESM — a real ES module for JSON
 * exposes only `default` — so the named form fails the moment this file is
 * loaded as ESM rather than compiled. That happens in the `esm` Jest project,
 * where `TypingEffect` reaches this module through `@util/katex`.
 */
export const MAIDR_VERSION: string = packageJson.version;
