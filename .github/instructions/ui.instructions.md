---
description: "View layer"
applyTo: "src/ui/**"
---

<!-- Generated from .claude/rules/ui.md by scripts/sync-copilot-instructions.mjs. Do not edit directly. -->

# View layer

React components in `src/ui/` render state. They hold no business logic.

## Shape

```tsx
export const Text: React.FC = () => {
  const { enabled, value, announce } = useViewModelState('text');

  return (
    <div>
      {enabled && <p aria-live={announce ? 'assertive' : 'off'}>{value}</p>}
    </div>
  );
};
```

## Rules

- **State comes from `useViewModelState(key)`.** No `useSelector`, no service
  imports, no model imports. A component that reaches past the ViewModel breaks
  the architecture.
- **User actions go out through `useViewModel(key)`** or a dispatched command —
  never by calling a service method directly.
- **Functional components only**, with typed props. Keep each component to one
  responsibility and extract reusable logic into hooks under `src/state/hook/`.
- **Memoize deliberately.** `useMemo` for expensive derivations, `useCallback`
  for callbacks passed as props, `React.memo` where a component re-renders on
  stable props. Do not wrap everything by reflex.
- Keep `useEffect` dependency arrays complete and honest; add cleanup returns
  for anything that subscribes or schedules.
- Register new components in `src/ui/App.tsx`.

## Accessibility is not optional here

This is an accessibility library — a visually correct component that a screen
reader cannot use is a broken component. Before finishing any component, check
the rules in `rules/accessibility.md`: live regions, labels and roles, keyboard
operability, visible focus, and contrast.
