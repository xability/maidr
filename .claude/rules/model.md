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
`segmented.ts`, `smooth.ts`, `violin.ts`, `pie.ts`. There is no
`src/model/trace/` subdirectory.

## Rules

- **Always call `this.notifyStateUpdate()`** after any state change. A move that
  does not notify produces silence, stale text, and a stale braille display —
  this is the single most common bug in this layer.
- **Guard moves with `isMovable()`** before mutating `row`/`col`, and keep the
  bounds check consistent with the data shape you actually index into.
- **Never import from `src/service/`, `src/state/`, or `src/ui/`.** The model
  notifies; it does not call.
- **One trace class per file**, extending `AbstractTrace`. It is not generic —
  the point type lives on the subclass's own `points` field, not in a type
  parameter.

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

A trace type is registered in six places, then verified across the modality
services. `TraceType` keys a total `Record` in two of them, so those two fail
the build if you forget; the rest fail at runtime, or — for braille — not at
all. `PieTrace` is the most recent worked example; grep `TraceType.PIE` to see
every one of them at once.

1. In `src/type/grammar.ts`: add the `TraceType` member, the point shape
   (`PiePoint`), and that point to the `MaidrLayer.data` union.
2. Add the class in `src/model/`, extending `AbstractTrace` — which is **not**
   generic. Assign `movable` (usually a `MovableGrid` over your points, which
   supplies `moveOnce()` and `isMovable()`), and implement the abstract
   accessors: `audio`, `braille`, `text`, `description`, `dimension`,
   `highlightValues`, `values`, `supportsExtrema`, and `findNearestPoint`.
3. Add the `case` to `TraceFactory.create()` in `src/model/factory.ts` — an
   unregistered type throws `Invalid trace type`, and the throw propagates out
   of `new Figure(...)`, so nothing renders at all.
4. Add the display name to `CHART_TYPE_LABEL` in `src/model/abstract.ts`. It is
   a `Record<TraceType, string>`, so omitting it is a compile error.
5. Answer `IS_ORIENTED` in `src/util/orientation.ts` — also a total `Record`,
   and also a compile error to omit. `true` means the trace resolves
   `layer.orientation` and swaps its main and cross axes; a pie is `false`,
   because slices sit around a circle rather than along an axis.
6. Register a braille encoder in the `encoders` Map in `src/service/braille.ts`.
   **An unregistered type is silent**, not a crash: the guarded early return
   leaves braille users with an empty display and no error anywhere. Reuse an
   existing encoder when the state shape matches — a pie's single row of
   magnitudes is the `BarBrailleEncoder`'s input exactly.
7. Confirm the audio, text, highlight, and high-contrast services handle it, and
   document the braille encoding in `docs/BRAILLE.md`.

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
