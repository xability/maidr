/**
 * Hand-written declarations for `dotPadSdk.js`.
 *
 * The module is plain JS so `scripts/vendor-dotpad-sdk.mjs` (run directly by
 * node) can import it; `tsconfig.json` sets `allowJs: false`, so a TypeScript
 * test needs these to import it too. Keep both files in sync.
 */

/**
 * One file of the SDK: its size and digests at the pinned commit.
 *
 * `md5` is for the R binding, which verifies with `tools::md5sum` because
 * base R has no SHA-256; the vendoring script checks both.
 */
export interface SdkFile {
  bytes: number;
  sha256: string;
  md5: string;
}

/** `src/service/dotPadSdk.json`. */
export interface SdkManifest {
  version: string;
  repository: string;
  commit: string;
  baseUrl: string;
  module: string;
  assetDir: string;
  files: Record<string, SdkFile>;
}

/** The manifest as written beside a vendored copy. */
export interface VendoredManifest extends SdkManifest {
  retrieved: string;
}

export const MANIFEST_PATH: string;
export const DEFAULT_OUT_DIR: string;
export const OUTPUT_MANIFEST_NAME: string;

export function readManifest(): SdkManifest;
export function fileUrl(manifest: SdkManifest, file: string): string;
export function mismatch(bytes: Uint8Array, expected: SdkFile): string | null;
export function outputManifest(manifest: SdkManifest, retrieved: Date): VendoredManifest;
