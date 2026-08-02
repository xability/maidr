<!-- Generated from CLAUDE.md by scripts/sync-copilot-instructions.mjs. Do not edit directly. -->

# MAIDR — development guide

**MAIDR** (Multimodal Access and Interactive Data Representation) gives blind
and low-vision users non-visual access to statistical graphics through audio
sonification, text descriptions, braille output, visual highlighting, and
AI-generated descriptions.

**Stack:** TypeScript, React, Redux Toolkit, Web Audio API, Vite.

## Commands

```bash
npm install            # install dependencies
npm run dev:recharts   # dev server against the Recharts example
npm run dev:victory    # dev server against the Victory example
npm run build          # production build
npm run type-check     # tsc --noEmit
npm run lint:fix       # eslint --fix
npm test               # jest: unit, component and ESM projects
npm run e2e            # playwright end-to-end tests
npm run docs:serve     # build and preview the docs site
```

There is no `npm run dev` or `npm run preview`; use the per-example dev servers
above and `npm run build:preview` for a full preview build.

## Architecture

Strict MVVC. Each layer knows only the layer below it.

```
VIEW (React)  →  VIEWMODEL (Redux)  →  SERVICES  →  MODEL
  src/ui/        src/state/           src/service/  src/model/
```

Every interaction follows one path:

```
keypress → KeybindingService → CommandExecutor → Command → Context
        → Trace.notifyStateUpdate() → observing Services → Emitter events
        → ViewModels → Redux → React
```

`src/controller.ts` wires it all together and disposes it on teardown. Detailed
per-layer rules load automatically from `.claude/rules/` when you open files in
that layer.

## Layout

```
src/
├─ index.tsx          # entry point
├─ controller.ts      # constructs services + viewmodels, registers observers
├─ model/             # Figure → Subplot → Trace, navigation, context
├─ service/           # audio, text, braille, highlight, keybinding, chat, …
├─ command/           # one class per user action
├─ state/             # store, viewModel/ (Redux bridge), hook/
├─ ui/                # React components
├─ adapters/          # chart-library integrations
├─ type/              # shared types; grammar.ts is the input schema
└─ util/              # emitter, svg helpers, …

test/                 # jest unit tests, mirrors src/
e2e_tests/specs/      # playwright specs
```

## Principles

1. **Keep it simple.** Readable beats clever. No abstraction before a second
   caller exists.
2. **Respect the layer boundaries.** The model never imports a service; a
   service never dispatches Redux; a component never touches a service or the
   model. Crossing a boundary is a regression.
3. **Debug before you edit.** Reproduce, isolate the layer, trace the flow, find
   the root cause, then design the smallest fix. The full workflow and the
   per-layer checklists are in `.claude/skills/debug-maidr/SKILL.md`; in Claude
   Code, run `/debug-maidr`.
4. **Accessibility is the product.** A change that works visually but drops an
   announcement, a braille update, or a keyboard path is broken.
5. **Change only what the task requires.** One logical change per commit.

## Before finishing

```bash
npm run lint:fix && npm run type-check && npm run build && npm test
```

Report what actually happened. If a test fails or a step was skipped, say so.

## Agent configuration

`.claude/` holds the Claude Code configuration — path-scoped rules, subagents,
and skills. The GitHub Copilot equivalents under `.github/` are generated from
it by `scripts/sync-copilot-instructions.mjs`, so edit the `.claude/` side and
run `npm run sync:copilot`. See `.claude/README.md` for what goes where and how
the two map onto each other.
