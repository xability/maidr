---
description: "MVVC architecture"
applyTo: "src/**"
---

<!-- Generated from .claude/rules/architecture.md by scripts/sync-copilot-instructions.mjs. Do not edit directly. -->

# MVVC architecture

MAIDR uses a strict layered architecture. Each layer knows only about the layer
below it. Crossing a boundary is an architectural regression, not a shortcut.

```
VIEW (React)  →  VIEWMODEL (Redux)  →  SERVICES  →  MODEL
  src/ui/        src/state/           src/service/  src/model/
```

## Layer contracts

| Layer         | Location              | May do                                                        | Must never do                                              |
| ------------- | --------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| **Model**     | `src/model/`          | Hold data, navigate, call `notifyStateUpdate()`                | Import a service, touch the DOM, know about React or Redux |
| **Service**   | `src/service/`        | Business logic, side effects, `update(state)`, fire `Emitter`s | Dispatch Redux actions, render UI, import a ViewModel      |
| **ViewModel** | `src/state/viewModel/`| Listen to service events, dispatch Redux actions               | Contain business logic                                     |
| **View**      | `src/ui/`             | Render from `useViewModelState()`                              | Access a service or the model directly, hold business logic|

`src/controller.ts` is the only place that wires these together: it constructs
services and ViewModels, registers observers on the model, and disposes
everything on teardown.

## Canonical data flow

Every user interaction travels the same path. When something does not work,
walk this list in order to find the broken link.

```
keypress
  → KeybindingService (src/service/keybinding.ts)
  → CommandExecutor   (src/service/commandExecutor.ts)
  → Command           (src/command/)
  → Context           (src/model/context.ts)
  → Trace             (src/model/*.ts)  ── notifyStateUpdate()
  → Services observe  (audio, text, braille, highlight)  ── Emitter fires
  → ViewModels        (src/state/viewModel/)             ── store.dispatch()
  → React re-renders  (src/ui/)
```

## Adding to the system

- **New trace type** → class in `src/model/`, register in `src/model/factory.ts`,
  add the type to `src/type/grammar.ts`. See `model.instructions.md`.
- **New service** → class in `src/service/`, construct and register as an
  observer in `src/controller.ts`, dispose it there too. See `service.instructions.md`.
- **New UI state** → service fires an event, a ViewModel in
  `src/state/viewModel/` dispatches, a component reads it with
  `useViewModelState()`. See `viewmodel.instructions.md` and `ui.instructions.md`.
- **New keyboard action** → command in `src/command/`, keybinding in
  `src/service/keybinding.ts`, help entry in `src/service/help.ts`.
  See `command.instructions.md`.

## Working style

- **Debug before you edit.** Reproduce, isolate the layer, trace the flow, find
  the root cause, then design the smallest fix. The full workflow and the
  per-layer checklists are in `.claude/skills/debug-maidr/SKILL.md`; in Claude
  Code, run `/debug-maidr`.
- **Keep it simple.** Prefer readable code over clever code. Break large
  functions into single-purpose ones. Do not add abstractions before a second
  caller exists.
- **Change only what the task requires.** One logical change per commit.
  Preserve the surrounding patterns even when you would have written it
  differently.
