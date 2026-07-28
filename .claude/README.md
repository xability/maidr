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

### Adding a rule

Create `.claude/rules/<topic>.md` with `paths:` globs. Subdirectories are
discovered automatically, so `rules/frontend/react.md` works. Omit `paths:`
only if it is genuinely needed in every session — an unscoped rule that applies
narrowly is wasted context.

```markdown
---
paths:
  - "src/adapters/**"
---

# Adapter conventions
...
```

## `agents/`

| Agent                  | Role                                                         |
| ---------------------- | ------------------------------------------------------------ |
| `planner`              | Breaks a feature into ordered, layer-tagged tasks             |
| `architect`            | Validates a plan against the MVVC boundaries (read-only)      |
| `implementer`          | Writes the code                                               |
| `code-reviewer`        | Reviews changes for architecture, quality, a11y, security     |
| `test-runner`          | Runs and repairs the Jest and Playwright suites               |
| `accessibility-expert` | Audits the four modalities and WCAG compliance                |
| `feature-builder`      | Orchestrates the six above through a full feature lifecycle   |

Keep each agent's `description` short and specific — it is what Claude matches
against when deciding to delegate, and it loads on every request. Keep the body
about the *role*; the codebase conventions come from `rules/`.

## `skills/`

| Skill          | Invoked                                       |
| -------------- | --------------------------------------------- |
| `/code`        | manually — implement a change                 |
| `/code-review` | manually — review a diff or PR                |
| `/debug-maidr` | manually, or automatically when debugging     |

`code` and `code-review` set `disable-model-invocation: true`, so they cost no
context until you invoke them. `debug-maidr` stays model-invocable because
"debug before you edit" should apply whether or not someone remembers to ask.

## References

- [CLAUDE.md and `.claude/rules/`](https://code.claude.com/docs/en/memory)
- [Subagents](https://code.claude.com/docs/en/sub-agents)
- [Skills](https://code.claude.com/docs/en/skills)
- [Choosing between them](https://code.claude.com/docs/en/features-overview)
