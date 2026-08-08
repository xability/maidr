/**
 * Matches dependency-bump commits authored by bots (Dependabot, Renovate).
 *
 * Those commits list every bumped package in the body, which routinely
 * exceeds `body-max-line-length`. A failing commitlint job skips every job
 * declaring `needs: [commitlint, lint]` in ci.yml -- build, unit-test,
 * type-check, e2e-smoke and docs-build -- so dependency updates would merge
 * without ever being built or tested.
 *
 * Anchored on the subject so a `build(deps)` mention inside the body of an
 * ordinary commit does not silently bypass linting.
 *
 * Kept free of imports so it can be unit tested; commitlint's own config
 * packages are ESM and cannot be loaded by this repo's CommonJS Jest setup.
 *
 * @param message - The raw commit message, subject line first.
 * @returns Whether commitlint should skip this commit.
 */
export function isBotDependencyBump(message: string): boolean {
  return /^(?:build|chore)\(deps(?:-dev)?\)/.test(message);
}
