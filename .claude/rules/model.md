---
paths:
  - "src/model/**"
---

# Model layer

`src/model/` holds domain data and navigation logic only. No UI concerns, no
service dependencies, no DOM access outside the SVG helpers.

## Hierarchy

`Figure` → `Subplot` → `Trace`, all extending `AbstractObservableElement`
(`src/model/abstract.ts`) and all implementing the same `Movable` interface
(`src/model/movable.ts`). This is the Composite pattern: `Context`
(`src/model/context.ts`) delegates `moveOnce` / `moveToIndex` to whichever
element is active without knowing which level that is.

Trace implementations live directly in `src/model/` — `bar.ts`, `line.ts`,
`scatter.ts`, `box.ts`, `heatmap.ts`, `histogram.ts`, `candlestick.ts`,
`segmented.ts`, `smooth.ts`, `violin.ts`. There is no `src/model/trace/`
subdirectory.

## Rules

- **Always call `this.notifyStateUpdate()`** after any state change. A move that
  does not notify produces silence, stale text, and a stale braille display —
  this is the single most common bug in this layer.
- **Guard moves with `isMovable()`** before mutating `row`/`col`, and keep the
  bounds check consistent with the data shape you actually index into.
- **Never import from `src/service/`, `src/state/`, or `src/ui/`.** The model
  notifies; it does not call.
- **One trace class per file**, extending `AbstractTrace<T>`.

## Strategy pattern: the four modalities

Every trace implements the same four accessors, each returning state for one
modality. Adding a trace type means implementing all four — a trace that
returns nothing for `braille()` is inaccessible to braille users.

```typescript
abstract audio(): AudioState;      // min, max, size, index, value
abstract braille(): BrailleState;
abstract text(): TextState;
abstract get highlightValues(): SVGElement[][] | null;
```

Services call these without knowing the concrete type, so keep the shape of the
returned state consistent with the other traces.

## Registering a new trace type

1. Add the class in `src/model/`, extending `AbstractTrace<YourPoint>`.
2. Implement `moveOnce()`, `isMovable()`, and the four modality accessors.
3. Add the `case` to `TraceFactory.create()` in `src/model/factory.ts` —
   an unregistered type throws at runtime.
4. Add the type to `TraceType` and the point shape to `src/type/grammar.ts`.
5. Confirm the audio, text, braille, and highlight services handle it.

## Ownership-aware highlight disposal

`highlightValues` can hold two different kinds of SVG element:

- hidden clones and markers **created by MAIDR**, and
- the chart's **original live geometry** referenced for in-place highlighting
  (heatmap cells, library-rendered line dots).

`AbstractTrace.dispose()` removes only elements stamped with the
`data-maidr-owned` attribute, so disposal can never delete the visible chart.

**Every code path that creates a highlight element must mark it.** The `Svg`
helpers (`selectAllElements` / `selectElement` with clone,
`createEmptyElement`, `createCircleElement`, `createLineElement`,
`createHighlightElement`) already do. If you clone or synthesize an element by
hand, wrap it in `Svg.markOwned(...)`. Elements selected with
`shouldClone = false` are live chart geometry — never mark or remove them.
