# MAIDR Architecture Documentation

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Layer Responsibilities](#layer-responsibilities)
3. [Data Flow](#data-flow)
4. [Key Components](#key-components)
5. [Initialization & Lifecycle](#initialization--lifecycle)

## Architecture Overview

MAIDR follows a strict **MVVC (Model-View-ViewModel-Controller)** architecture with clear separation between layers.

### Layer Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ VIEW (React Components)                                     │
│ - Renders UI based on Redux state                          │
│ - Uses useViewModelState() hook to subscribe               │
│ - NO business logic, NO direct service access              │
└─────────────────────────────────────────────────────────────┘
                          ↕ Redux state subscription
┌─────────────────────────────────────────────────────────────┐
│ VIEWMODEL (Redux + ViewModels)                             │
│ - Listens to Service events                                │
│ - Dispatches Redux actions to update UI state              │
│ - Bridge between Services and Views                        │
└─────────────────────────────────────────────────────────────┘
                          ↕ Event listeners
┌─────────────────────────────────────────────────────────────┐
│ CONTROLLER & SERVICES                                       │
│ - Controller: Lifecycle orchestrator                       │
│ - Services: Business logic (Audio, Text, Braille, etc.)   │
│ - Implement Observer pattern                               │
│ - Execute Commands from user input                         │
└─────────────────────────────────────────────────────────────┘
                          ↕ Observer pattern
┌─────────────────────────────────────────────────────────────┐
│ MODEL (Domain Data)                                         │
│ - Figure → Subplot → Trace hierarchy                       │
│ - Context for navigation state                             │
│ - Observable: notifies observers on state changes          │
└─────────────────────────────────────────────────────────────┘
```

## Layer Responsibilities

### MODEL LAYER (`/src/model/`)

**Responsibility:** Domain data and navigation logic

**Key Classes:**

- `Figure` - Root element containing subplots
- `Subplot` - Container for multiple traces
- `Trace` - Individual plot data (Bar, Line, Scatter, etc.)
- `Context` - Navigation state manager

**Rules:**

- Contains ONLY data and navigation logic
- NO UI concerns, NO service dependencies
- Implements Observable pattern
- Notifies observers on state changes via `notifyStateUpdate()`

**Example:**

```typescript
// src/model/trace/BarTrace.ts
export class BarTrace extends AbstractTrace<BarPoint> {
  moveOnce(direction: MovableDirection): void {
    // Update position
    if (direction === 'UPWARD') {
      this.row = Math.min(this.row + 1, this.values.length - 1);
    }

    // Notify all observers (AudioService, TextService, etc.)
    this.notifyStateUpdate();
  }
}
```

### CONTROLLER & SERVICE LAYER (`/src/controller.ts`, `/src/service/`)

**Responsibility:** Business logic, orchestration, side effects

**Controller (`controller.ts`):**

- Creates and wires all services
- Manages lifecycle (creation, disposal)
- Registers observers on models
- Single entry point for service coordination

**Services:**

- `AudioService` - Sonification using Web Audio API
- `TextService` - Generate text descriptions
- `BrailleService` - Braille output
- `HighlightService` - Visual SVG highlighting
- `KeybindingService` - Keyboard event routing
- `DisplayService` - Focus and mode state management
- `SettingsService` - User preferences
- More...

**Rules:**

- Services implement `Observer<State>` interface
- Listen to model changes via `update(state)` method
- Fire events when work is complete
- NO direct UI manipulation (fire events instead)
- NO direct Redux dispatch (ViewModels handle that)

**Example:**

```typescript
// src/service/audio.ts
export class AudioService implements Observer<TraceState> {
  update(state: TraceState): void {
    // React to trace state change
    const audioState = state.audio;

    // Generate audio (side effect)
    this.play(audioState.value);
  }

  private play(value: number): void {
    // Web Audio API logic
    const frequency = this.normalize(value);
    const oscillator = this.audioContext.createOscillator();
    oscillator.frequency.value = frequency;
    oscillator.start();
  }
}
```

### VIEWMODEL LAYER (`/src/state/viewModel/`)

**Responsibility:** Bridge between Services and UI

**Key Classes:**

- `TextViewModel` - Manages text state
- `BrailleViewModel` - Manages braille state
- `ChatViewModel` - Manages chat state
- `DisplayViewModel` - Manages focus/mode state
- More...

**Rules:**

- Listen to Service events
- Dispatch Redux actions to update state
- Extend `AbstractViewModel<State>`
- NO business logic (delegate to services)

**Example:**

```typescript
// src/state/viewModel/TextViewModel.ts
export class TextViewModel extends AbstractViewModel<TextState> {
  constructor(
    store: AppStore,
    textService: TextService,
    notificationService: NotificationService
  ) {
    super(store);

    // Listen to service event
    this.disposables.push(
      textService.onChange((e) => {
        // Dispatch Redux action
        this.store.dispatch(update(e.value));
      })
    );
  }

  get state(): TextState {
    return this.store.getState().text;
  }
}
```

### VIEW LAYER (`/src/ui/`)

**Responsibility:** Render UI based on state

**Key Components:**

- `App.tsx` - Root component
- `Text.tsx` - Text display
- `Braille.tsx` - Braille display
- `Chat.tsx` - AI chat interface
- `Settings.tsx` - Settings panel
- More...

**Rules:**

- Subscribe to Redux state via `useViewModelState()` hook
- NO business logic (just rendering)
- NO direct service access
- NO direct model access

**Example:**

```typescript
// src/ui/Text.tsx
export const Text: React.FC = () => {
  // Subscribe to Redux state via hook
  const { enabled, value, announce, message } = useViewModelState('text');

  // Just render - NO logic
  return (
    <div>
      {enabled && <p aria-live={announce ? 'assertive' : 'off'}>{value}</p>}
      {message && <p>{message}</p>}
    </div>
  );
};
```

## Data Flow

### Complete Flow: User Keypress → Audio + Text Output

```
1. USER PRESSES KEY: ArrowUp
   ↓
2. KeybindingService (hotkeys-js)
   - Matches key to scope: TRACE scope, key 'up' → 'MOVE_UP'
   - Calls CommandExecutor.executeCommand('MOVE_UP')
   ↓
3. CommandExecutor
   - Validates command for current scope
   - Creates command: CommandFactory.create('MOVE_UP')
   - Executes: command.execute()
   ↓
4. MoveUpCommand
   - Calls context.moveOnce('UPWARD')
   ↓
5. Context (Navigation Manager)
   - Delegates to active plot: this.active.moveOnce('UPWARD')
   ↓
6. Trace (e.g., BarTrace)
   - Updates internal state: this.row += 1
   - Notifies observers: this.notifyStateUpdate()
   ↓
7. PARALLEL OBSERVER UPDATES:

   AudioService.update(state)
   - Extracts value from state.audio
   - Plays tone at frequency

   TextService.update(state)
   - Generates description: "Point 5 of 10, value 45.2"
   - Fires event: this.onChangeEmitter.fire({ value: text })

   BrailleService.update(state)
   - Generates braille pattern
   - Fires event to BrailleViewModel

   HighlightService.update(state)
   - Updates SVG element visibility
   ↓
8. ViewModels listen to events

   TextViewModel hears textService.onChange
   - Dispatches Redux action: store.dispatch(update(text))
   ↓
9. Redux Store updates
   - state.text.value = "Point 5 of 10, value 45.2"
   - state.text.announce = true
   ↓
10. React Components re-render
    - Text component: useViewModelState('text') detects change
    - Component re-renders with new value
    - aria-live region announces to screen reader
    ↓
11. USER PERCEIVES:
    - Audio tone plays
    - Text announced by screen reader
    - Braille display updates
    - Visual highlight on SVG
```

## Key Components

### 1. Figure Hierarchy

```typescript
Figure (Observable<FigureState>)
  ├─ Properties
  │   ├─ id: string
  │   ├─ title, subtitle, caption: string
  │   ├─ subplots: Subplot[][] (2D grid)
  │   └─ observers: Observer<FigureState>[]
  │
  ├─ Methods
  │   ├─ moveOnce(direction) - Navigate subplots
  │   ├─ activeSubplot - Get current subplot
  │   ├─ addObserver(observer)
  │   └─ notifyStateUpdate()
  │
  └─ Subplot (Observable<SubplotState>)
       ├─ Properties
       │   ├─ traces: Trace[][] (2D array)
       │   └─ observers: Observer<SubplotState>[]
       │
       ├─ Methods
       │   ├─ moveOnce(direction) - Navigate traces
       │   ├─ activeTrace - Get current trace
       │   └─ notifyStateUpdate()
       │
       └─ Trace (Observable<TraceState>)
            ├─ Implementations
            │   ├─ BarTrace
            │   ├─ LineTrace
            │   ├─ ScatterTrace
            │   ├─ BoxTrace
            │   └─ More...
            │
            ├─ Properties
            │   ├─ points: T[][] (data)
            │   ├─ row, col: position
            │   └─ observers: Observer<TraceState>[]
            │
            └─ Methods
                ├─ moveOnce(direction)
                ├─ audio() - AudioState
                ├─ braille() - BrailleState
                ├─ text() - TextState
                ├─ highlight() - HighlightState
                └─ notifyStateUpdate()
```

### 2. Context (Navigation State Manager)

**Location:** `/src/model/context.ts`

**Purpose:** Manages current navigation state and scope

```typescript
class Context implements Disposable {
  private plotContext: Stack<Plot>; // [Figure, Subplot, Trace]
  private scopeContext: Stack<Scope>; // [SUBPLOT, TRACE]

  get active(): Plot; // Current Figure/Subplot/Trace
  get state(): PlotState; // Current state
  get scope(): Scope; // Current keyboard scope

  toggleScope(newScope: Scope): void; // Switch scopes

  // Delegates to active plot
  moveOnce(direction: MovableDirection): void;
  moveToIndex(row: number, col: number): void;
}
```

### 3. Controller (Orchestrator)

**Location:** `/src/controller.ts`

**Purpose:** Create and wire all components

```typescript
class Controller implements Disposable {
  // Model
  private figure: Figure;
  private context: Context;

  // Services (15+ services)
  private displayService: DisplayService;
  private audioService: AudioService;
  private textService: TextService;
  private brailleService: BrailleService;
  // ... more

  // ViewModels (8+ viewmodels)
  private textViewModel: TextViewModel;
  private brailleViewModel: BrailleViewModel;
  // ... more

  constructor(maidr: Maidr, plot: HTMLElement) {
    // Create figure from data
    this.figure = new Figure(maidr);
    this.context = new Context(this.figure);

    // Create all services
    this.createServices();

    // Create all viewmodels
    this.createViewModels();

    // Wire observers
    this.registerObservers();

    // Register keybindings
    this.keybinding.register(this.context.scope);
  }

  private registerObservers(): void {
    // Wire model to services
    this.figure.addObserver(this.textService);
    this.figure.addObserver(this.audioService);
    // ... more
  }

  dispose(): void {
    // Cleanup all resources
  }
}
```

## Initialization & Lifecycle

### 1. Application Bootstrap

```
HTML page loads
  ↓
Script loads maidr.js
  ↓
index.ts executes
  ↓
Wait for DOMContentLoaded (if needed)
  ↓
main() function
  ├─ Query elements with [maidr-data]
  ├─ Parse JSON from attribute
  └─ For each plot: initMaidr(data, plotElement)
  ↓
initMaidr(maidr, plot)
  ├─ Create DOM structure (article, figure, container)
  ├─ Register focus event listeners
  ├─ Render React app: <Provider><App /></Provider>
  └─ Create & dispose initial Controller
  ↓
On focusin event
  └─ Create new Controller instance
```

### 2. Controller Lifecycle

```
Controller Constructor
  ├─ Parse maidr data → Figure → Subplots → Traces
  ├─ Create Context for navigation
  ├─ Instantiate all Services
  ├─ Instantiate all ViewModels
  ├─ Register observers (model → services)
  ├─ Register keybindings
  └─ Register mouse events
  ↓
User Interaction Phase
  ├─ Keyboard/mouse events
  ├─ Commands execute
  ├─ Model updates
  ├─ Observers notified
  ├─ Services react
  ├─ ViewModels update Redux
  └─ UI re-renders
  ↓
On focusout event
  └─ Controller.dispose() called
  ↓
Controller Disposal
  ├─ Unregister keybindings
  ├─ Unregister mouse events
  ├─ Dispose all ViewModels
  ├─ Dispose all Services
  ├─ Clear observers
  ├─ Clear context
  └─ Controller ready for GC
```

### 3. Service Initialization

Services are created with dependencies injected:

```typescript
// In Controller constructor

// Create base services first
this.notificationService = new NotificationService();
this.settingsService = new SettingsService();

// Create services that depend on base services
this.audioService = new AudioService(
  this.notificationService,
  this.context.state,
  this.settingsService
);

this.textService = new TextService(
  this.notificationService,
  this.context.state,
  this.settingsService
);

// Create ViewModels that depend on services
this.textViewModel = new TextViewModel(
  store,
  this.textService,
  this.notificationService,
  this.autoplayService
);
```

## State Management

### Redux Store Structure

```typescript
{
  text: {
    enabled: boolean,
    announce: boolean,
    value: string,
    message: string | null
  },
  braille: {
    enabled: boolean,
    content: string
  },
  chat: {
    open: boolean,
    messages: Message[],
    loading: boolean
  },
  display: {
    focus: Focus | null,
    tooltip: { visible: boolean, x: number, y: number }
  },
  settings: {
    audio: { enabled: boolean, volume: number },
    text: { mode: 'VERBOSE' | 'TERSE' },
    // ... more settings
  },
  // ... more slices
}
```

### How State Updates Work

```
Service fires event
  ↓
ViewModel listens to event
  ↓
ViewModel dispatches Redux action
  ↓
Redux reducer updates state
  ↓
React component subscribed via useViewModelState()
  ↓
Component re-renders
```

**Example:**

```typescript
// 1. Service fires event
textService.onChange.fire({ value: "Point 5" });

// 2. ViewModel listens
textViewModel: textService.onChange((e) => {
  store.dispatch(update(e.value));  // 3. Dispatch action
});

// 4. Reducer updates state
textSlice.reducers.update: (state, action) => {
  state.value = action.payload;
}

// 5. Component subscribes and re-renders
const Text: React.FC = () => {
  const { value } = useViewModelState('text');  // Subscribes
  return <p>{value}</p>;  // Re-renders on change
};
```

## Best Practices

### 1. Respect Layer Boundaries

**DO:**

- Model notifies observers → Services listen → ViewModels dispatch → UI renders
- Each layer only knows about layers below it

**DON'T:**

- Model calling services directly
- Services calling React components directly
- UI components accessing model directly

### 2. Always Notify Observers

When changing model state:

```typescript
moveOnce(direction: MovableDirection): void {
  this.row += 1;
  this.notifyStateUpdate();  // ✅ ALWAYS notify
}
```

### 3. Use Emitters for Service Events

```typescript
class MyService {
  private onChangeEmitter = new Emitter<MyEvent>();

  get onChange(): Event<MyEvent> {
    return this.onChangeEmitter.event;
  }

  private doWork(): void {
    // Do work
    this.onChangeEmitter.fire({ data: result });
  }
}
```

### 4. Dispose Resources Properly

Every class that allocates resources implements `Disposable`:

```typescript
class MyService implements Disposable {
  dispose(): void {
    // Clean up timers, listeners, etc.
    this.disposables.forEach(d => d.dispose());
  }
}
```

---

For design pattern examples, see **PATTERNS.md**.
