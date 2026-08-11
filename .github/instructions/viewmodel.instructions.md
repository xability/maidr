---
description: "ViewModel layer"
applyTo: "src/state/**"
---

<!-- Generated from .claude/rules/viewmodel.md by scripts/sync-copilot-instructions.mjs. Do not edit directly. -->

# ViewModel layer

`src/state/viewModel/` is the only bridge between services and Redux. A
ViewModel listens to service events and dispatches actions. It contains no
business logic of its own.

## Shape

```typescript
export class TextViewModel extends AbstractViewModel<TextState> {
  constructor(store: AppStore, textService: TextService) {
    super(store);

    this.disposables.push(
      textService.onChange((e) => {
        this.store.dispatch(update(e.value));
      }),
    );
  }

  get state(): TextState {
    return this.store.getState().text;
  }
}
```

## Rules

- **Extend `AbstractViewModel<State>`** (`src/state/viewModel/viewModel.ts`) so
  `dispose()` is inherited.
- **Push every subscription into `this.disposables`.** An event listener that
  outlives its controller keeps dispatching into a dead store.
- **Translate, do not compute.** If you find yourself deriving values, ranges,
  or descriptions here, that logic belongs in the service.
- **Do not call services to make them do work.** ViewModels react to events;
  commands drive behaviour.
- Register the ViewModel in `src/state/viewModel/registry.ts` and dispose it
  from `Controller.dispose()`.

## Redux

- Redux Toolkit `createSlice` with a typed initial state; the store is assembled
  in `src/state/store.ts`.
- Reducers stay pure and trivial — assign the payload, nothing more.
- Components subscribe through `useViewModelState(key)`; hooks live in
  `src/state/hook/`. Never call `useSelector` directly from a component.
