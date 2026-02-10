# Design Patterns in MAIDR

This document provides detailed examples of design patterns used in MAIDR codebase.

## Table of Contents

1. [Observer Pattern](#observer-pattern)
2. [Command Pattern](#command-pattern)
3. [Factory Pattern](#factory-pattern)
4. [Composite Pattern](#composite-pattern)
5. [Strategy Pattern](#strategy-pattern)
6. [Emitter Pattern](#emitter-pattern)
7. [Disposable Pattern](#disposable-pattern)

---

## Observer Pattern

**Purpose:** Decouple models from services. When model state changes, multiple services react without model knowing about them.

### Implementation

**Observable Interface:**

```typescript
// src/type/observer.ts
interface Observable<State> {
  addObserver: (observer: Observer<State>) => void;
  removeObserver: (observer: Observer<State>) => void;
  notifyStateUpdate: () => void;
}

interface Observer<State> {
  update: (state: State) => void;
}
```

**Model Implementation:**

```typescript
// src/model/abstract.ts
abstract class AbstractObservableElement<Element, State>
implements Observable<State> {
  protected observers: Observer<State>[] = [];

  addObserver(observer: Observer<State>): void {
    this.observers.push(observer);
  }

  removeObserver(observer: Observer<State>): void {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }

  notifyStateUpdate(): void {
    // Notify all observers with current state
    for (const observer of this.observers) {
      observer.update(this.state);
    }
  }

  abstract get state(): State;
}
```

**Service Implementation (Observer):**

```typescript
// src/service/audio.ts
export class AudioService implements Observer<TraceState>, Disposable {
  update(state: TraceState): void {
    // React to trace state change
    if (state.empty)
      return;

    const audioState = state.audio;
    this.play(audioState.value);
  }

  private play(value: number): void {
    // Web Audio API logic
    const frequency = this.normalizeToFrequency(value);
    const oscillator = this.audioContext.createOscillator();
    oscillator.frequency.value = frequency;
    oscillator.connect(this.audioContext.destination);
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.3);
  }
}
```

**Wiring in Controller:**

```typescript
// src/controller.ts
class Controller {
  private registerObservers(): void {
    // Register services as observers on figure
    this.figure.addObserver(this.textService);
    this.figure.addObserver(this.audioService);

    // Register on subplots
    for (const subplot of this.figure.subplots.flat()) {
      subplot.addObserver(this.textService);
      subplot.addObserver(this.brailleService);

      // Register on traces
      for (const trace of subplot.traces.flat()) {
        trace.addObserver(this.audioService);
        trace.addObserver(this.textService);
        trace.addObserver(this.brailleService);
        trace.addObserver(this.highlightService);
      }
    }
  }
}
```

### Why This Pattern?

**Problem:** Trace navigation needs to trigger audio, text, braille, and highlighting.

**Without Observer:**

```typescript
// ❌ BAD: Tight coupling
class BarTrace {
  constructor(
    private audioService: AudioService,
    private textService: TextService,
    private brailleService: BrailleService
  ) {}

  moveOnce(direction: MovableDirection): void {
    this.row += 1;

    // Model now depends on services
    this.audioService.play(this.currentValue);
    this.textService.update(this.description);
    this.brailleService.update(this.braille);
  }
}
```

**With Observer:**

```typescript
// ✅ GOOD: Decoupled
class BarTrace extends AbstractObservableElement<BarPoint, TraceState> {
  moveOnce(direction: MovableDirection): void {
    this.row += 1;
    this.notifyStateUpdate(); // Just notify - don't know who listens
  }
}
```

---

## Command Pattern

**Purpose:** Encapsulate user actions as objects. Decouples keyboard input from execution logic.

### Implementation

**Command Interface:**

```typescript
// src/command/command.ts
export interface Command {
  execute: (event?: Event) => void;
}
```

**Command Examples:**

```typescript
// src/command/move.ts
export class MoveUpCommand implements Command {
  constructor(private context: Context) {}

  execute(): void {
    this.context.moveOnce('UPWARD');
  }
}

export class MoveDownCommand implements Command {
  constructor(private context: Context) {}

  execute(): void {
    this.context.moveOnce('DOWNWARD');
  }
}

// src/command/toggle.ts
export class ToggleAudioCommand implements Command {
  constructor(private audioService: AudioService) {}

  execute(): void {
    this.audioService.toggleEnabled();
  }
}
```

**Command Factory:**

```typescript
// src/command/factory.ts
export class CommandFactory {
  constructor(
    private context: Context,
    private audioService: AudioService,
    private textService: TextService,
    // ... other dependencies
  ) {}

  create(commandKey: Keys): Command {
    switch (commandKey) {
      case 'MOVE_UP':
        return new MoveUpCommand(this.context);

      case 'MOVE_DOWN':
        return new MoveDownCommand(this.context);

      case 'TOGGLE_AUDIO':
        return new ToggleAudioCommand(this.audioService);

      case 'TOGGLE_TEXT':
        return new ToggleTextCommand(this.textService);

      case 'DESCRIBE_POINT':
        return new DescribePointCommand(this.context, this.textService);

      default:
        throw new Error(`Unknown command: ${commandKey}`);
    }
  }
}
```

**Command Executor:**

```typescript
// src/command/executor.ts
export class CommandExecutor {
  constructor(
    private commandFactory: CommandFactory,
    private context: Context
  ) {}

  executeCommand(commandKey: Keys, event?: Event): void {
    // Validate command is valid for current scope
    if (!this.isValidForScope(commandKey, this.context.scope)) {
      console.warn(`Command ${commandKey} not valid for scope ${this.context.scope}`);
      return;
    }

    // Create and execute command
    const command = this.commandFactory.create(commandKey);
    command.execute(event);
  }
}
```

**Keybinding Integration:**

```typescript
// src/service/keybinding.ts
export class KeybindingService {
  constructor(
    private commandExecutor: CommandExecutor,
    private context: Context
  ) {}

  register(scope: Scope): void {
    const keymap = SCOPED_KEYMAP[scope];

    for (const [commandKey, hotkey] of Object.entries(keymap)) {
      hotkeys(hotkey, scope, (event) => {
        event.preventDefault();
        this.commandExecutor.executeCommand(commandKey as Keys, event);
      });
    }

    hotkeys.setScope(scope);
  }
}
```

### Why This Pattern?

**Benefits:**

- Decouples input handling from execution
- Easy to add new commands
- Can queue, log, or undo commands (future feature)
- Centralized command validation

---

## Factory Pattern

**Purpose:** Create different trace types based on configuration without tight coupling.

### Implementation

```typescript
// src/model/factory.ts
export class TraceFactory {
  static create(layer: MaidrLayer): Trace {
    switch (layer.type) {
      case TraceType.BAR:
        return new BarTrace(layer);

      case TraceType.LINE:
        return new LineTrace(layer);

      case TraceType.SCATTER:
      case TraceType.POINT:
        return new ScatterTrace(layer);

      case TraceType.BOX:
        return new BoxTrace(layer);

      case TraceType.HEATMAP:
        return new Heatmap(layer);

      case TraceType.HISTOGRAM:
        return new Histogram(layer);

      case TraceType.CANDLESTICK:
        return new Candlestick(layer);

      case TraceType.STACKED:
      case TraceType.DODGED:
      case TraceType.NORMALIZED:
        return new SegmentedTrace(layer);

      case TraceType.SMOOTH:
        return createSmoothTrace(layer);

      default:
        throw new Error(`Unknown trace type: ${layer.type}`);
    }
  }
}
```

**Usage:**

```typescript
// src/model/plot.ts
class Subplot {
  constructor(subplot: MaidrSubplot) {
    this.traces = subplot.layers.map(layer =>
      TraceFactory.create(layer) // Factory creates appropriate type
    );
  }
}
```

### Why This Pattern?

**Without Factory:**

```typescript
// ❌ BAD: Tight coupling
class Subplot {
  constructor(subplot: MaidrSubplot) {
    this.traces = subplot.layers.map((layer) => {
      if (layer.type === 'bar') {
        return new BarTrace(layer);
      } else if (layer.type === 'line') {
        return new LineTrace(layer);
      } else if (layer.type === 'scatter') {
        return new ScatterTrace(layer);
      }
      // ... many more conditions
    });
  }
}
```

**With Factory:**

```typescript
// ✅ GOOD: Centralized creation logic
class Subplot {
  constructor(subplot: MaidrSubplot) {
    this.traces = subplot.layers.map(layer =>
      TraceFactory.create(layer)
    );
  }
}
```

---

## Composite Pattern

**Purpose:** Treat individual objects and compositions uniformly. Navigate Figure/Subplot/Trace hierarchy with same interface.

### Implementation

```typescript
// Common interface for all plot elements
interface Movable {
  moveOnce: (direction: MovableDirection) => void;
  moveToExtreme: (direction: MovableDirection) => void;
  moveToIndex: (row: number, col: number) => void;
  isMovable: (target: MovableDirection | [number, number]) => boolean;
}

// Figure (composite - contains subplots)
class Figure extends AbstractObservableElement<Subplot, FigureState>
  implements Movable {
  private subplots: Subplot[][];

  moveOnce(direction: MovableDirection): void {
    // Navigate between subplots
    const [nextRow, nextCol] = this.getNextPosition(direction);
    if (this.isMovable([nextRow, nextCol])) {
      this.row = nextRow;
      this.col = nextCol;
      this.notifyStateUpdate();
    }
  }

  get activeSubplot(): Subplot {
    return this.subplots[this.row][this.col];
  }
}

// Subplot (composite - contains traces)
class Subplot extends AbstractObservableElement<Trace, SubplotState>
  implements Movable {
  private traces: Trace[][];

  moveOnce(direction: MovableDirection): void {
    // Navigate between traces
    const [nextRow, nextCol] = this.getNextPosition(direction);
    if (this.isMovable([nextRow, nextCol])) {
      this.row = nextRow;
      this.col = nextCol;
      this.notifyStateUpdate();
    }
  }

  get activeTrace(): Trace {
    return this.traces[this.row][this.col];
  }
}

// Trace (leaf - contains data points)
class BarTrace extends AbstractTrace<BarPoint> implements Movable {
  private points: BarPoint[][];

  moveOnce(direction: MovableDirection): void {
    // Navigate between data points
    const [nextRow, nextCol] = this.getNextPosition(direction);
    if (this.isMovable([nextRow, nextCol])) {
      this.row = nextRow;
      this.col = nextCol;
      this.notifyStateUpdate();
    }
  }
}
```

**Context delegates to active element:**

```typescript
// src/model/context.ts
class Context {
  private plotContext: Stack<Plot>; // [Figure, Subplot, Trace]

  get active(): Plot {
    return this.plotContext.peek();
  }

  moveOnce(direction: MovableDirection): void {
    // Delegates to active element (Figure, Subplot, or Trace)
    this.active.moveOnce(direction);
  }
}
```

### Why This Pattern?

**Benefits:**

- Uniform interface at all levels
- Can navigate figure, subplot, or trace level with same commands
- Easy to add nesting levels
- Context doesn't need to know which level is active

---

## Strategy Pattern

**Purpose:** Different trace types have different behaviors for audio, text, and braille generation.

### Implementation

**Base Strategy:**

```typescript
// src/model/abstract.ts
abstract class AbstractTrace<T> {
  // Each trace type implements these differently
  abstract audio(): AudioState;
  abstract braille(): BrailleState;
  abstract text(): TextState;
  abstract get highlightValues(): SVGElement[][] | null;
}
```

**Concrete Strategies:**

```typescript
// src/model/trace/BarTrace.ts
export class BarTrace extends AbstractTrace<BarPoint> {
  audio(): AudioState {
    return {
      min: Math.min(...this.points.flat().map(p => p.y)),
      max: Math.max(...this.points.flat().map(p => p.y)),
      size: this.points.length,
      index: this.row,
      value: this.currentPoint.y, // Bar-specific: use y value
    };
  }

  text(): TextState {
    return {
      title: this.title,
      description: `Bar ${this.row + 1} of ${this.points.length}, ${this.currentPoint.x}: ${this.currentPoint.y}`
    };
  }
}

// src/model/trace/LineTrace.ts
export class LineTrace extends AbstractTrace<LinePoint> {
  audio(): AudioState {
    const currentLine = this.points[this.row];
    return {
      min: Math.min(...currentLine.map(p => p.y)),
      max: Math.max(...currentLine.map(p => p.y)),
      size: currentLine.length,
      index: this.col,
      value: this.currentPoint.y,
      groupIndex: this.row, // Line-specific: which line
    };
  }

  text(): TextState {
    return {
      title: this.title,
      description: `Line ${this.row + 1}, point ${this.col + 1} of ${this.points[this.row].length}, value: ${this.currentPoint.y}`
    };
  }
}

// src/model/trace/ScatterTrace.ts
export class ScatterTrace extends AbstractTrace<ScatterPoint> {
  audio(): AudioState {
    // Scatter-specific: use distance from origin or custom metric
    const distance = Math.sqrt(
      this.currentPoint.x ** 2 + this.currentPoint.y ** 2
    );
    return {
      min: 0,
      max: this.maxDistance,
      size: this.points.flat().length,
      index: this.currentIndex,
      value: distance,
    };
  }

  text(): TextState {
    return {
      title: this.title,
      description: `Point ${this.currentIndex + 1}, x: ${this.currentPoint.x}, y: ${this.currentPoint.y}`
    };
  }
}
```

### Why This Pattern?

**Benefits:**

- Each trace type encapsulates its own behavior
- Easy to add new trace types (just extend AbstractTrace)
- Services don't need to know trace type (they just call `trace.audio()`)

---

## Emitter Pattern

**Purpose:** Decouple event firing from event handling. Services fire events, ViewModels listen.

### Implementation

**Emitter Class:**

```typescript
// src/util/emitter.ts
export class Emitter<T> {
  private listeners: Set<(e: T) => void> = new Set();

  // Public event interface for listeners
  get event(): Event<T> {
    return (listener: (e: T) => void) => {
      this.listeners.add(listener);

      // Return disposable to unsubscribe
      return {
        dispose: () => this.listeners.delete(listener)
      };
    };
  }

  // Fire event to all listeners
  fire(event: T): void {
    this.listeners.forEach(listener => listener(event));
  }

  // Cleanup
  dispose(): void {
    this.listeners.clear();
  }
}

export type Event<T> = (listener: (e: T) => void) => Disposable;
```

**Service Using Emitter:**

```typescript
// src/service/text.ts
export class TextService implements Observer<PlotState> {
  private onChangeEmitter = new Emitter<{ value: string }>();

  // Public event interface
  get onChange(): Event<{ value: string }> {
    return this.onChangeEmitter.event;
  }

  update(state: PlotState): void {
    const description = this.generateDescription(state);

    // Fire event
    this.onChangeEmitter.fire({ value: description });
  }
}
```

**ViewModel Listening:**

```typescript
// src/state/viewModel/TextViewModel.ts
export class TextViewModel extends AbstractViewModel<TextState> {
  constructor(store: AppStore, textService: TextService) {
    super(store);

    // Listen to service event
    const disposable = textService.onChange((e) => {
      // Dispatch Redux action
      this.store.dispatch(update(e.value));
    });

    // Store disposable for cleanup
    this.disposables.push(disposable);
  }
}
```

### Why This Pattern?

**Benefits:**

- Services don't know about ViewModels or Redux
- ViewModels subscribe to service events
- Easy to add multiple listeners
- Clean unsubscription via disposables

---

## Disposable Pattern

**Purpose:** Proper resource cleanup (timers, listeners, audio contexts, etc.)

### Implementation

**Disposable Interface:**

```typescript
// src/type/disposable.ts
export interface Disposable {
  dispose: () => void;
}
```

**Service Implementation:**

```typescript
// src/service/audio.ts
export class AudioService implements Disposable {
  private audioContext: AudioContext;
  private disposables: Disposable[] = [];
  private activeAudioIds: Map<TimeoutId, OscillatorNode[]> = new Map();

  constructor() {
    this.audioContext = new AudioContext();
  }

  dispose(): void {
    // Stop all active audio
    for (const [timeoutId, oscillators] of this.activeAudioIds) {
      clearTimeout(timeoutId);
      oscillators.forEach(osc => osc.stop());
    }
    this.activeAudioIds.clear();

    // Close audio context
    this.audioContext.close();

    // Dispose all disposables
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
```

**ViewModel Implementation:**

```typescript
// src/state/viewModel/abstract.ts
export abstract class AbstractViewModel<T> implements Disposable {
  protected disposables: Disposable[] = [];

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}

// Concrete ViewModel
export class TextViewModel extends AbstractViewModel<TextState> {
  constructor(store: AppStore, textService: TextService) {
    super(store);

    // Add event listener disposables
    this.disposables.push(
      textService.onChange((e) => {
        this.store.dispatch(update(e.value));
      })
    );
  }
  // dispose() inherited from AbstractViewModel
}
```

**Controller Cleanup:**

```typescript
// src/controller.ts
export class Controller implements Disposable {
  dispose(): void {
    // Unregister keybindings
    this.keybinding.unregister();
    this.mousebinding.unregister();

    // Dispose ViewModels
    ViewModelRegistry.instance.dispose();
    this.textViewModel.dispose();
    this.brailleViewModel.dispose();
    // ... more

    // Dispose Services
    this.audioService.dispose();
    this.textService.dispose();
    this.autoplayService.dispose();
    // ... more

    // Dispose model
    this.context.dispose();
    this.figure.dispose();
  }
}
```

### Why This Pattern?

**Benefits:**

- Prevents memory leaks
- Cleans up timers, audio, event listeners
- Clear contract for resource cleanup
- Easy to track what needs cleanup

---

## Pattern Combinations

MAIDR combines patterns for powerful architecture:

### Observer + Emitter + ViewModel

```
Model (Observable)
  ↓ notifyStateUpdate()
Service (Observer + Emitter)
  ↓ fires event
ViewModel (Event Listener)
  ↓ dispatches Redux action
React Component
  ↓ re-renders
```

### Command + Factory + Strategy

```
User Input
  ↓
KeybindingService
  ↓
CommandFactory (Factory Pattern)
  ↓
Command (Command Pattern)
  ↓
Context
  ↓
Trace (Strategy Pattern - different implementations)
```

### Composite + Observer

```
Figure (Composite + Observable)
  ├─ Subplot (Composite + Observable)
  │   └─ Trace (Observable)
  │       └─ notifies observers
  └─ notifies observers

All use same Movable interface (Composite)
All notify observers on change (Observer)
```

---

## Summary

| Pattern        | Purpose                    | Key Benefit                              |
| -------------- | -------------------------- | ---------------------------------------- |
| **Observer**   | Model → Service decoupling | Multiple services react to state changes |
| **Command**    | Action encapsulation       | Decouple input from execution            |
| **Factory**    | Object creation            | Centralized trace type creation          |
| **Composite**  | Hierarchical structure     | Uniform interface for navigation         |
| **Strategy**   | Behavior variants          | Different trace implementations          |
| **Emitter**    | Event system               | Service → ViewModel decoupling           |
| **Disposable** | Resource cleanup           | Prevent memory leaks                     |

These patterns work together to create a maintainable, scalable, testable architecture.
