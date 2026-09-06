/**
 * Commit dates for the site's sitemap `<lastmod>` and TechArticle dates.
 *
 * `actions/checkout` gives every file the checkout time as its mtime, so file
 * stats would stamp the build date on every URL; Google ignores a `lastmod`
 * that changes on every build. The dates here come from git instead, and the
 * docs workflows check out full history so they are the real ones.
 */

import { execFileSync } from 'node:child_process';

/**
 * Run a git command in `cwd` and return its trimmed stdout, or an empty
 * string when git is unavailable or the command fails (no history, a tarball
 * checkout, a path git has never seen).
 */
export function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** Date (YYYY-MM-DD) of the last commit touching `relPath`, else `fallback`. */
export function lastCommitDate(cwd, relPath, fallback) {
  return git(cwd, ['log', '-1', '--format=%cs', '--', relPath]) || fallback;
}

/**
 * Date of the commit that added `relPath`, followed across renames, falling
 * back to its last commit date. On a shallow clone the earliest visible
 * commit stands in for the real first one.
 */
export function firstCommitDate(cwd, relPath, fallback) {
  const dates = git(cwd, ['log', '--follow', '--diff-filter=A', '--format=%cs', '--', relPath]).split('\n').filter(Boolean);
  return dates.at(-1) || lastCommitDate(cwd, relPath, fallback);
}
