---
name: debug-maidr
description: "Debug-first workflow for MAIDR: locate the broken link in the keypress → command → model → observer → ViewModel → React chain. Use when audio, text, braille, highlighting, navigation, or a keyboard shortcut is not working, or when diagnosing a test failure or unexpected runtime behaviour."
allowed-tools: Read, Grep, Glob, Bash, Edit
---

# Debugging MAIDR

Do not jump to a fix. In a layered observer architecture, the symptom appears
several layers away from the cause, so a fix applied at the symptom almost
always hides the bug instead of removing it.

## Workflow

1. **Reproduce** — exact steps, plus what you observed vs. what you expected.
2. **Isolate** — which layer? Model, Service, ViewModel, or View.
3. **Trace** — log at the decision points along the chain, prefixed for grep:
   `console.log('[Audio] update():', state)`.
4. **Find the root cause** — what assumption is wrong? Not "what silences the
   error".
5. **Verify the hypothesis** — confirm with a targeted test or log before
   editing, and check whether the same mistake exists elsewhere.
6. **Design the minimal fix** — smallest change that removes the cause and
   keeps the layer boundaries intact.
7. **Test** — the failing case now passes, and nothing else broke.
8. **Remove the logging** you added.

## The chain

Almost every "X does not work" report is one broken link here. Walk it in
order and find the first link that does not fire:

```
keypress
  → KeybindingService     src/service/keybinding.ts       scope registered?
  → CommandExecutor       src/service/commandExecutor.ts  valid for scope?
  → Command               src/command/                    case in factory?
  → Context               src/model/context.ts            delegating to active?
  → Trace.moveOnce()      src/model/*.ts                  isMovable? position changed?
  → notifyStateUpdate()   src/model/abstract.ts           observers.length > 0?
  → Service.update()      src/service/                    registered in controller?
  → Emitter.fire()        src/util/emitter.ts             listener attached?
  → ViewModel dispatch    src/state/viewModel/            action reached the store?
  → useViewModelState()   src/ui/                         component re-rendered?
```

The single most common root cause is a **missing `addObserver` registration in
`src/controller.ts`** — the service is correct and simply never called. The
second most common is a **missing `notifyStateUpdate()`** after a model change.

## Symptom → first thing to check

| Symptom                        | Check first                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| **No audio**                   | Is `AudioService.update()` called at all? Then `audioContext.state` — a suspended context needs a user gesture to resume. Then mode/enabled, then `NaN` values. |
| **Text does not change**       | Does `TextService` fire `onChange`? Does the ViewModel listener run? Check the Redux slice in DevTools. |
| **Braille stale**              | Same chain as text, through `BrailleViewModel`.                                          |
| **Navigation stuck**           | `isMovable()` returning false, or `row`/`col` bounds computed against the wrong dimension. |
| **One shortcut dead**          | Wrong scope — the key is bound in `TRACE` but the user is in `BRAILLE`. Then platform modifiers, then a conflicting binding. |
| **No highlight**               | Does the selector match anything? `document.querySelectorAll(selector).length` is usually 0 because the SVG structure differs from what the trace assumes. |
| **Highlight deletes the chart**| An element cloned by hand without `Svg.markOwned(...)`, or a `shouldClone = false` element wrongly marked owned. |
| **Leak across focus changes**  | Something not released in `dispose()` — check the whole chain, controller included. |

## Layer checklists

**Model** — is `notifyStateUpdate()` called after every state change? Are
`row`/`col` in bounds? Does `isMovable()` agree with the data shape? Is the
JSON parsed as expected?

**Service** — is `update(state)` reached? Is the event fired? Are resources
released in `dispose()`?

**ViewModel** — is the listener registered and pushed into `disposables`? Is the
action dispatched? Does the store actually change?

**View** — is the component subscribed via `useViewModelState()`? Does it
re-render? Are the handlers wired?

## Tools

```bash
npm run type-check          # tsc, catches the whole class of type-level bugs
npm test -- <pattern>       # narrow the jest run to the failing area
npm run e2e:debug           # playwright, step through a failing spec
```

In the browser: Redux DevTools for state transitions and time travel, React
DevTools for the component tree, Elements for the SVG structure behind a
selector mismatch.

## Logging

Prefix every line so it can be filtered: `[Audio]`, `[Model]`, `[TextVM]`. Log
before and after a state change rather than in the middle. Never log inside a
tight loop — it will change the timing you are trying to observe.

Remove the logging before committing; `no-console` is enforced by lint.
