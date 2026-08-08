# `.claude/` — Claude Code configuration

This directory configures how Claude Code works in the MAIDR repository. Its
layout follows Anthropic's documented `.claude/` structure, where each
mechanism is defined by **when it loads**.

## Layout

```
CLAUDE.md              # project root — loaded in full, every session
.claude/
├─ README.md           # this file
├─ rules/              # instructions, loaded when matching files are opened
├─ agents/             # subagents, run in their own context window
└─ skills/             # workflows, loaded on demand when invoked
```

## Do `agents/` and `rules/` both belong here?

Yes. They are orthogonal, not alternatives, and Anthropic's `.claude/`
reference lists both as first-class directories.

- **`rules/` are instructions.** They enter the context of whoever is doing the
  work and shape how that work is done.
- **`agents/` are workers.** Each runs its own agentic loop in a separate
  context window and returns a summary.

They compose rather than compete: a subagent inherits the CLAUDE.md hierarchy,
**including project rules**, so a rule written once applies both in the main
conversation and inside every subagent. Keeping conventions in `rules/` is what
lets the agent definitions stay short — they describe a *role*, not the
codebase.

## Which mechanism for what

| Put it in…      | When it loads                                       | Use for                                                     |
| --------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| **`CLAUDE.md`** | Every session, in full                              | What every session needs: commands, layout, core principles |
| **`rules/`**    | When Claude opens a file matching `paths:`          | Conventions for one layer, language, or directory           |
| **`skills/`**   | On demand — you type `/name`, or Claude matches it  | Multi-step procedures and reference material                |
| **`agents/`**   | When delegated to, in an isolated context window    | Side work that would flood the main conversation            |

Rule of thumb: if it is a *convention*, it is a rule. If it is a *procedure*,
it is a skill. If it is a *worker*, it is an agent. If every session needs it,
it belongs in `CLAUDE.md`.

## `rules/`

Each file covers one topic and declares `paths:` frontmatter, so it costs
nothing until Claude opens a file it applies to.

| Rule               | Scope                                                     |
| ------------------ | ---------------------------------------------------------- |
| `architecture.md`  | `src/**` — MVVC layer contracts and the canonical data flow |
| `model.md`         | `src/model/**` — traces, `notifyStateUpdate()`, highlight ownership |
| `service.md`       | `src/service/**`, `controller.ts` — Observer, Emitter, Disposable |
| `viewmodel.md`     | `src/state/**` — the Redux bridge                          |
| `ui.md`            | `src/ui/**` — React rendering rules                        |
| `command.md`       | `src/command/**`, keybinding services — commands and scopes |
| `accessibility.md` | UI and the four modality services — the non-negotiables    |
| `typescript.md`    | all `.ts`/`.tsx` — types, style, error handling            |
| `testing.md`       | `test/**`, `e2e_tests/**` — Jest and Playwright conventions |
| `git-workflow.md`  | *unscoped* — Conventional Commits and semantic-release      |

`git-workflow.md` deliberately has no `paths:`, so it loads every session:
commit conventions are needed even in sessions that never open a source file.

### Adding or removing a rule

Create `.claude/rules/<topic>.md` with `paths:` globs. Subdirectories are
discovered automatically, so `rules/frontend/react.md` works. Omit `paths:`
only if it is genuinely needed in every session — an unscoped rule that applies
narrowly is wasted context.

Write `paths:` as a block list, one glob per line, as below. The sync script
rejects a flow sequence (`paths: ["src/**"]`) rather than let a scoped rule
silently mirror as `applyTo: "**"`.

```markdown
---
paths:
  - "src/adapters/**"
---

# Adapter conventions
...
```

Either way, run `npm run sync:copilot` afterwards and commit what it writes.

**Removing or renaming a rule takes one extra step.** The generator will not
delete the instruction file left behind, to avoid surprise deletions — it only
prints a note naming it. Delete that file yourself, or `sync:copilot:check`
keeps failing in CI after you have "already run the generator."

## `agents/`

| Agent                  | Role                                                         |
| ---------------------- | ------------------------------------------------------------ |
| `planner`              | Breaks a feature into ordered, layer-tagged tasks             |
| `architect`            | Validates a plan against the MVVC boundaries (read-only)      |
| `implementer`          | Writes the code                                               |
| `code-reviewer`        | Reviews changes for architecture, quality, a11y, security     |
| `test-runner`          | Runs and repairs the Jest and Playwright suites               |
| `accessibility-expert` | Audits the four modalities and WCAG compliance                |
| `debugger`             | Root-cause analysis; preloads the `debug-maidr` skill         |
| `feature-builder`      | Orchestrates plan → architect → implement → review → test → audit |

Keep each agent's `description` short and specific — it is what Claude matches
against when deciding to delegate, and it loads on every request. Keep the body
about the *role*; the codebase conventions come from `rules/`.

## `skills/`

| Skill          | Invoked                                   |
| -------------- | ----------------------------------------- |
| `/debug-maidr` | manually, or automatically when debugging |

`debug-maidr` is model-invocable rather than `disable-model-invocation: true`,
because "debug before you edit" should apply whether or not someone remembers
to ask for it.

This directory is deliberately small. A skill earns its place by being a
*procedure* that nothing else covers. Conventions belong in `rules/`, which
already reach every agent; a persona that duplicates an agent's role belongs in
`agents/`. Claude Code also ships bundled skills such as `/code-review` — check
whether one already covers the need before adding a project skill, since a
project skill with the same name shadows the bundled one.

## GitHub Copilot

The repository is configured for Copilot as well, under `.github/`. The two
tools have the same four concepts with different file formats:

| Concept                     | Claude Code                     | GitHub Copilot                        |
| --------------------------- | ------------------------------- | ------------------------------------- |
| Repo-wide, always loaded    | `CLAUDE.md`                     | `.github/copilot-instructions.md`     |
| Path-scoped instructions    | `.claude/rules/*.md` (`paths:`) | `.github/instructions/*.instructions.md` (`applyTo:`) |
| Isolated worker             | `.claude/agents/*.md`           | `.github/agents/*.agent.md`           |
| On-demand workflow          | `.claude/skills/*/SKILL.md`     | `.github/prompts/*.prompt.md`         |

### The instruction files are generated — do not edit them

`.github/copilot-instructions.md` and everything in `.github/instructions/` is
produced from the Claude Code sources by
`scripts/sync-copilot-instructions.mjs`. Keeping two hand-written copies of the
same conventions guarantees they drift, so there is one authored source and one
generated mirror.

```bash
npm run sync:copilot         # regenerate after editing CLAUDE.md or a rule
npm run sync:copilot:check   # what CI runs; fails if the mirror is stale
```

Two things are transformed:

- **Frontmatter.** A rule's `paths:` YAML list becomes Copilot's
  comma-separated `applyTo:` string, and an unscoped rule — which loads every
  session in Claude Code — becomes `applyTo: "**"`. Brace groups are expanded,
  since `applyTo` documents commas but not braces.
- **Cross-references.** A rule that points at `rules/model.md` is rewritten to
  point at `model.instructions.md`, so a reader working only from
  `.github/instructions/` never follows a pointer to a file that does not exist
  on their side.

Subdirectories are mirrored, so `.claude/rules/frontend/react.md` generates
`.github/instructions/frontend/react.instructions.md`.

Renaming or deleting a rule leaves the old generated file behind. `--check`
treats that as a failure; the plain `sync:copilot` only prints a note about it,
so delete the orphan yourself rather than waiting for CI to point at it.

Copilot also reads `CLAUDE.md` directly as an agent-instructions file, so the
generated `copilot-instructions.md` keeps the two surfaces consistent rather
than giving Copilot a second, divergent description of the project.

### What is not mirrored

Agents and workflows are **not** generated, because the formats genuinely
differ — Copilot agents use a display `name`, `handoffs`, and its own tool
vocabulary, while Claude subagents use `permissionMode`, `memory`, `skills`,
and `maxTurns`. Both directories carry the same eight roles; keep them in step
by hand when a role changes.

The workflow files are intentionally asymmetric. `.github/prompts/` holds
GitHub-specific chores (filing an issue from a template, replying to a PR
review) that Claude Code does through `gh` and its GitHub tools instead, and
`.claude/skills/debug-maidr/` has no Copilot counterpart because the
`debugger` agent covers that ground on Copilot's side.

## References

- [CLAUDE.md and `.claude/rules/`](https://code.claude.com/docs/en/memory)
- [Subagents](https://code.claude.com/docs/en/sub-agents)
- [Skills](https://code.claude.com/docs/en/skills)
- [Choosing between them](https://code.claude.com/docs/en/features-overview)
- [Copilot custom instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions)
- [Copilot custom agents](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
