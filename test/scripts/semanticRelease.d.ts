/**
 * Neither semantic-release plugin ships types, and neither has a
 * DefinitelyTyped package. Declared here rather than left implicitly `any`,
 * which `noImplicitAny` rejects anyway.
 *
 * Only the two functions `releaseBreakingMarker.esm-test.ts` calls are
 * declared, and only as much of their shape as it uses. A wider guess would
 * be a fiction the compiler would then enforce — the plugin config in
 * particular is whatever `.releaserc.json` holds, which is the point of the
 * test reading it from there.
 */
declare module '@semantic-release/commit-analyzer' {
  export function analyzeCommits(
    pluginConfig: unknown,
    context: unknown,
  ): Promise<string | null>;
}

declare module '@semantic-release/release-notes-generator' {
  export function generateNotes(
    pluginConfig: unknown,
    context: unknown,
  ): Promise<string>;
}
