---
description: "Service layer"
applyTo: "src/service/**,src/controller.ts"
---

<!-- Generated from .claude/rules/service.md by scripts/sync-copilot-instructions.mjs. Do not edit directly. -->

# Service layer

Services in `src/service/` hold business logic and side effects. They observe
the model and publish results as events. They do not touch React or Redux.

## Observer: receiving model changes

A service that reacts to navigation implements `Observer<State>`:

```typescript
export class AudioService implements Observer<TraceState>, Disposable {
  update(state: TraceState): void {
    if (state.empty)
      return;
    this.play(state.audio.value);
  }
}
```

`update()` is called by the model's `notifyStateUpdate()`. If a service never
fires, the usual cause is a missing `addObserver` registration in
`src/controller.ts`, not a bug inside the service.

## Emitter: publishing results

Services must not dispatch Redux actions. They fire events; ViewModels listen.

```typescript
export class TextService implements Observer<PlotState> {
  private onChangeEmitter = new Emitter<{ value: string }>();

  get onChange(): Event<{ value: string }> {
    return this.onChangeEmitter.event;
  }

  update(state: PlotState): void {
    this.onChangeEmitter.fire({ value: this.generateDescription(state) });
  }
}
```

Expose the listener side as a `get`ter returning `Event<T>`; keep the `Emitter`
itself private so nothing outside the service can fire it.

## Disposable: cleaning up

Every service that allocates anything — timers, listeners, `AudioContext`,
`Emitter`s, subscriptions — implements `Disposable` and releases it all in
`dispose()`. Collect subscriptions in a `disposables: Disposable[]` and dispose
them as a group. Controllers are created and destroyed on every focus change,
so a leak here accumulates for the lifetime of the page.

## Rules

- **No Redux.** No `store.dispatch`, no slice imports. That is the ViewModel's job.
- **No direct UI manipulation.** Fire an event and let the ViewModel and React
  render the result. Direct DOM writes are limited to services that own SVG
  output, such as `highlight.ts`.
- **No model mutation.** Services read `state`; commands drive movement.
- **Inject dependencies through the constructor.** Base services
  (`notification.ts`, `settings.ts`) are constructed first in
  `src/controller.ts` and passed to the services that need them.
- **No secrets in source.** API keys belong in user settings at runtime, never
  committed — `chat.ts` and the LLM services are where this slips.
- **Validate what crosses the boundary.** Chart input, LLM responses, and live
  data feeds are untrusted: check shape before use, and never pass any of it
  onward as markup (see `ui.instructions.md`).

## Registering a new service

In `src/controller.ts`:

1. Construct it after its dependencies.
2. Register it as an observer on the figure, its subplots, and their traces if
   it needs model updates.
3. Create a ViewModel in `src/state/viewModel/` if it drives UI state.
4. Call its `dispose()` in `Controller.dispose()`.

Skipping step 4 is a memory leak; skipping step 2 makes the service silently
inert.
