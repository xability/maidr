---
description: "Git workflow"
applyTo: "**"
---

<!-- Generated from .claude/rules/git-workflow.md by scripts/sync-copilot-instructions.mjs. Do not edit directly. -->

# Git workflow

Releases are automated by semantic-release from `main`, so commit messages are
the release input, not just a log. Commitlint runs on `commit-msg` via Husky and
rejects anything that does not parse.

## Commit messages

Conventional Commits (`@commitlint/config-conventional`):

```
<type>(<optional scope>): <description>
```

Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `style`, `test`, `build`,
`ci`, `chore`, `revert`.

Version impact:

- `feat:` → minor release
- `fix:` / `perf:` → patch release
- `BREAKING CHANGE:` in the footer, or `!` after the type → major release
- everything else → no release

Write the description in the imperative mood, lower case, no trailing period:
`fix(audio): resume suspended context before playing empty-state tones`.

`!` works because `.releaserc.json` hands both commit-parsing plugins a
`parserOpts` that admits it. Without that they use the default angular
patterns, which do not, and a `!`-marked subject then fails to parse
entirely: no type, no matching release rule, **no release at all**, and the
commit missing from the notes as well. commitlint accepts `!` either way, so
nothing upstream of the release would have flagged it. Leave the
`parserOpts` alone unless you intend that; `test/scripts/releaseBreakingMarker.esm-test.ts`
fails if either plugin loses them.

Squashed merges compose the release commit from the pull request title, so a
breaking change needs its `!` **in the title**, not only in a commit inside
the branch.

## Changes producers depend on

What a layer type reads from `selectors` and `domMapping`, and the shape of its
`data`, is matched by every producer against its own rendering -- and most
producers, r-maidr, py-maidr and hand-written pages among them, are not in this
repository. py-maidr loads the latest release by default, so a change here
reaches every installed copy of it on the day it is published. #750, #991 and
#1135 each changed what a layer read, shipped as `fix:`, were checked against
"every producer in the tree", and between them took the highlight off
r-maidr's and py-maidr's charts for weeks with nothing failing.

So a change to what any layer type reads from a producer:

- keeps the shape producers emit today working, with a console warning, for at
  least one major version -- `src/util/selectors.ts` is how the pre-4.0
  selector lists are kept;
- carries `!` in the pull request title and a `BREAKING CHANGE:` footer naming
  the shape that changed, even when it also fixes a bug;
- updates the "Selectors" section of `docs/SCHEMA.md`;
- passes `e2e_tests/specs/bindingOutput.spec.ts`, which drives real r-maidr and
  py-maidr output through the build. A fixture that fails there is a reader who
  loses something on release day; change the fixture only when the binding has
  shipped the new shape.

## Practice

- One logical change per commit. Split unrelated fixes rather than bundling them.
- Never commit to `main` directly; work on a branch.
- Run `npm run lint:fix`, `npm run type-check`, and the relevant tests before
  committing.
- Do not hand-edit `CHANGELOG.md` or the `version` field in `package.json` —
  semantic-release owns both.
