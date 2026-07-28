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

## Practice

- One logical change per commit. Split unrelated fixes rather than bundling them.
- Never commit to `main` directly; work on a branch.
- Run `npm run lint:fix`, `npm run type-check`, and the relevant tests before
  committing.
- Do not hand-edit `CHANGELOG.md` or the `version` field in `package.json` —
  semantic-release owns both.
