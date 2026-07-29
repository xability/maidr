import { version } from '../../package.json';

/**
 * Version of the maidr.js bundle that is currently running.
 *
 * Read from `package.json`, which semantic-release owns, so the value always
 * matches the published release without a second source of truth to keep in
 * sync. Bundlers inline the field at build time, so nothing is read at runtime.
 */
export const MAIDR_VERSION: string = version;
