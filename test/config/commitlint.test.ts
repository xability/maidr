import { isBotDependencyBump } from '../../commitlint.ignores';

/**
 * Guards the `ignores` predicate that lets bot dependency bumps bypass
 * commitlint. Without it, Dependabot's package-listing body trips
 * `body-max-line-length`, the commitlint job fails, and every job declaring
 * `needs: [commitlint, lint]` in ci.yml is skipped -- so dependency updates
 * would merge without ever being built or tested.
 */
describe('commitlint config ignores', () => {
  const isIgnored = isBotDependencyBump;

  // Verbatim subject from PR #650, the Dependabot security update that
  // exposed the problem.
  const dependabotSubject
    = 'build(deps): bump the npm_and_yarn group across 1 directory with 15 updates';

  const overLongBody
    = 'Body line that is comfortably longer than the one hundred character limit enforced by commitlint.';

  it.each([
    dependabotSubject,
    'build(deps): bump vite from 6.4.2 to 8.1.5',
    'build(deps-dev): bump eslint from 9.0.0 to 9.1.0',
    'chore(deps): bump axios from 1.15.0 to 1.18.1',
    'chore(deps-dev): bump jest from 29.0.0 to 30.0.0',
  ])('ignores bot dependency bump %#', (subject) => {
    expect(isIgnored(`${subject}\n\n${overLongBody}`)).toBe(true);
  });

  it.each([
    'fix(audio): correct frequency mapping for empty bar segments',
    'feat(position): announce the group name for multiline plots',
    'ci: skip commitlint for bot dependency bump commits',
    // Only build/chore bypass -- a feat touching dependency code still lints.
    'feat(deps): add a dependency resolution helper',
    // Scope must be exactly deps/deps-dev, not merely start with it.
    'chore(depsomething): unrelated change',
  ])('lints human-authored commit %#', (subject) => {
    expect(isIgnored(`${subject}\n\n${overLongBody}`)).toBe(false);
  });

  it('anchors on the subject, not anywhere in the body', () => {
    const message = `fix: something unrelated\n\nSee build(deps): ${overLongBody}`;
    expect(isIgnored(message)).toBe(false);
  });
});
