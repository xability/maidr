/**
 * Hand-written declarations for the parts of `repin-dotpad-sdk.mjs` the
 * tests import. The script is plain JS so node runs it directly; keep this
 * in sync with the `export`s there.
 */

/**
 * Reads a zip archive held in memory.
 * @returns Every file entry by name, directories skipped
 */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array>;

/**
 * The files of a release MAIDR loads at runtime: the module and `lib/**`.
 * @throws When the archive is not that release, or lacks the braille engine
 */
export function runtimeFiles(archive: Map<string, Uint8Array>, version: string): string[];
