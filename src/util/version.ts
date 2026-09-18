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

/**
 * The project's GitHub repository, as `package.json` declares it.
 *
 * Read from the same manifest as {@link MAIDR_VERSION} rather than written out
 * again, so the "Report an issue" button in the About tab cannot end up
 * pointing somewhere the package does not claim to live.
 * `test/util/diagnostics.test.ts` asserts the URL it builds, which is what
 * catches the manifest gaining a `git+` prefix or a `.git` suffix that this
 * plain read would otherwise carry into a broken link.
 */
export const MAIDR_REPOSITORY_URL: string = packageJson.repository.url;
