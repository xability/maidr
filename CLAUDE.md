# MAIDR - Development Guide for Claude

## Project Overview

**MAIDR** (Multimodal Access and Interactive Data Representation) provides accessible, non-visual access to statistical visualizations through **audio sonification, text descriptions, braille output, and AI-powered descriptions**.

**Tech Stack:** TypeScript, React, Redux Toolkit, Web Audio API, Vite

## Quick Start

```bash
# Install dependencies
npm install

# Linter
npm run lint:fix

# Build for production
npm run build

```

## Architecture Overview (MVVC Pattern)

MAIDR follows a strict **Model-View-ViewModel-Controller (MVVC)** architecture with clean separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│ VIEW LAYER (React Components)                               │
│ Location: /src/ui/                                          │
│ - App.tsx, Text.tsx, Braille.tsx, Chat.tsx, etc.          │
│ - Subscribe to Redux state via useViewModelState() hook    │
│ - NO direct service access, NO business logic              │
└─────────────────────────────────────────────────────────────┘
                          ↕ (Redux state)
┌─────────────────────────────────────────────────────────────┐
│ VIEWMODEL LAYER (State Management)                          │
│ Location: /src/state/viewModel/                            │
│ - TextViewModel, BrailleViewModel, ChatViewModel, etc.     │
│ - Listen to Service events → Dispatch Redux actions        │
│ - Bridge between Services and UI                           │
└─────────────────────────────────────────────────────────────┘
                          ↕ (Observer events)
┌─────────────────────────────────────────────────────────────┐
│ CONTROLLER & SERVICE LAYER (Business Logic)                 │
│ Location: /src/controller.ts, /src/service/                │
│ - Controller: Orchestrates all services and lifecycle      │
│ - Services: AudioService, TextService, BrailleService, etc.│
│ - Implement Observer pattern to listen to Model changes    │
│ - Execute Commands from user interactions                  │
└─────────────────────────────────────────────────────────────┘
                          ↕ (Observer pattern)
┌─────────────────────────────────────────────────────────────┐
│ MODEL LAYER (Domain Data & Navigation)                      │
│ Location: /src/model/                                       │
│ - Figure → Subplot → Trace hierarchy                       │
│ - Context for navigation state management                  │
│ - AbstractTrace base class with specific implementations   │
│ - Observable pattern: notify observers on state changes    │
└─────────────────────────────────────────────────────────────┘
```

### Key Flow: User Interaction → State Update → Rendering

```
User Input (keyboard/mouse)
  ↓
KeybindingService → Command.execute()
  ↓
Context → Model.moveOnce() / Model state change
  ↓
Model.notifyStateUpdate() → Observer Services
  ↓
Services generate outputs → Fire events
  ↓
ViewModels listen → Dispatch Redux actions
  ↓
Redux state updates → React components re-render
  ↓
User perceives (audio, text, braille, visual highlight)
```

## Core Principles for Code Changes

### 1. **KISS Principle (Keep It Simple, Stupid)**

- Write simple, readable code over clever solutions
- Prefer clear variable names over comments
- Break complex functions into smaller, single-purpose functions
- Avoid unnecessary abstractions
- If it can be done in 5 lines instead of 50, do it

**Example:**

```typescript
// ❌ BAD: Over-engineered
class DataProcessor {
  process(data: unknown): unknown {
    return this.pipeline.reduce((acc, fn) => fn(acc), data);
  }
}

// ✅ GOOD: Simple and clear
function formatValue(value: number): string {
  return value.toFixed(2);
}
```

### 2. **Follow MVVC Architecture**

**Always respect layer boundaries:**

- **Model:** Contains data and navigation logic only. No UI concerns.
- **ViewModel:** Bridges Services and UI. Listens to events, dispatches Redux actions.
- **View (React):** Renders state. No business logic, no direct service calls.
- **Controller/Services:** Business logic, side effects, coordination.

**When making changes:**

- Model changes? Update in `/src/model/`, ensure observers are notified
- UI changes? Update in `/src/ui/`, ensure proper state subscription
- Business logic? Update in `/src/service/` or `/src/command/`
- State management? Update ViewModel in `/src/state/viewModel/`

### 3. **Debug First, Understand, Then Implement**

**CRITICAL WORKFLOW:**

1. **Reproduce the issue** - Understand exactly when/how it occurs
2. **Debug & trace** - Use browser DevTools, add strategic `console.log` statements
3. **Find root cause** - Identify the exact line/component causing the issue
4. **Understand context** - Read surrounding code, understand why current code exists
5. **Design solution** - Plan the minimal change needed
6. **Implement** - Make the change following MVVC + KISS
7. **Test** - Verify fix works and doesn't break anything else

**Example debugging approach:**

```typescript
// Add strategic logging to trace the issue
console.log('[DEBUG] Trace state before move:', this.state);
this.moveOnce('UPWARD');
console.log('[DEBUG] Trace state after move:', this.state);
console.log('[DEBUG] Observers notified:', this.observers.length);
```

**DO NOT:**

- Jump to implementing without understanding root cause
- Copy-paste solutions without understanding them
- Make changes in multiple places simultaneously
- Assume the cause without verification

### 4. **Minimal, Focused Changes**

- One logical change per commit
- Change only what's necessary to fix the issue
- Don't refactor unrelated code in the same change
- Preserve existing patterns and conventions

## File Structure

```
maidr/
├─ src/
│  ├─ index.ts              # Entry point: initializes app, parses data
│  ├─ controller.ts         # Controller: orchestrates all services
│  │
│  ├─ model/                # MODEL LAYER
│  │  ├─ abstract.ts        # AbstractObservableElement, AbstractTrace
│  │  ├─ context.ts         # Context: navigation state manager
│  │  ├─ factory.ts         # TraceFactory: creates trace instances
│  │  ├─ plot.ts            # Figure, Subplot classes
│  │  └─ trace/             # Trace implementations (Bar, Line, Scatter, etc.)
│  │
│  ├─ service/              # SERVICE LAYER
│  │  ├─ audio.ts           # AudioService: sonification
│  │  ├─ text.ts            # TextService: text descriptions
│  │  ├─ braille.ts         # BrailleService: braille output
│  │  ├─ highlight.ts       # HighlightService: visual highlighting
│  │  ├─ keybinding.ts      # KeybindingService: keyboard routing
│  │  ├─ display.ts         # DisplayService: focus/mode management
│  │  └─ ...                # Other services
│  │
│  ├─ command/              # COMMAND PATTERN
│  │  ├─ factory.ts         # CommandFactory: creates commands
│  │  └─ ...                # Command implementations
│  │
│  ├─ state/                # STATE MANAGEMENT
│  │  ├─ store.ts           # Redux store configuration
│  │  ├─ viewModel/         # VIEWMODEL LAYER
│  │  │  ├─ TextViewModel.ts
│  │  │  ├─ BrailleViewModel.ts
│  │  │  └─ ...             # Other ViewModels
│  │  └─ slice/             # Redux slices (reducers)
│  │
│  ├─ ui/                   # VIEW LAYER (React Components)
│  │  ├─ App.tsx            # Main app component
│  │  ├─ Text.tsx           # Text display component
│  │  ├─ Braille.tsx        # Braille display component
│  │  └─ ...                # Other UI components
│  │
│  ├─ type/                 # TypeScript type definitions
│  │  ├─ grammar.ts         # Input JSON schema types (Maidr interface)
│  │  ├─ state.ts           # State types (PlotState, TraceState, etc.)
│  │  └─ ...
│  │
│  └─ util/                 # Utility functions
│
├─ dist/                    # Build output (generated)
├─ docs/                    # Additional documentation
│  ├─ ARCHITECTURE.md       # Detailed architecture documentation
│  └─ PATTERNS.md           # Design patterns reference
│
├─ CLAUDE.md               # This file
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

## Common Tasks & Patterns

### Adding a New Plot Type

1. **Create trace class** in `/src/model/trace/`

   ```typescript
   export class MyNewTrace extends AbstractTrace<MyPointType> {
     // Implement required abstract methods
     audio(): AudioState {
       /* ... */
     }

     braille(): BrailleState {
       /* ... */
     }

     text(): TextState {
       /* ... */
     }

     get highlightValues(): SVGElement[][] | null {
       /* ... */
     }
   }
   ```

2. **Register in TraceFactory** (`/src/model/factory.ts`)

   ```typescript
   case TraceType.MY_NEW_TYPE:
     return new MyNewTrace(layer);
   ```

3. **Define type** in `/src/type/grammar.ts`
   ```typescript
   export enum TraceType {
     // ...
     MY_NEW_TYPE = 'my_new_type',
   }
   ```

### Modifying Navigation Behavior

1. **Find the trace class** in `/src/model/trace/`
2. **Override `moveOnce()`** method if needed
   ```typescript
   moveOnce(direction: MovableDirection): void {
     // Custom navigation logic
     super.moveOnce(direction); // Or call parent
     this.notifyStateUpdate(); // Always notify observers
   }
   ```

### Adding a New Service

1. **Create service** in `/src/service/`

   ```typescript
   export class MyService implements Observer<TraceState>, Disposable {
     update(state: TraceState): void {
       // React to state changes
     }

     dispose(): void {
       // Cleanup
     }
   }
   ```

2. **Register in Controller** (`/src/controller.ts`)
   ```typescript
   this.myService = new MyService(dependencies);
   // In registerObservers():
   this.figure.addObserver(this.myService);
   ```

### Adding UI Features

1. **Create Redux slice** in `/src/state/slice/`
2. **Create ViewModel** in `/src/state/viewModel/`
3. **Create React component** in `/src/ui/`
4. **Connect via hook:**
   ```typescript
   const { value } = useViewModelState('myFeature');
   ```

## Key Design Patterns

### Observer Pattern (Model → Services)

- **When:** Model state changes need to trigger multiple side effects
- **How:** Model implements `Observable<State>`, services implement `Observer<State>`
- **Example:** Trace position changes → AudioService plays tone + TextService updates description

### Command Pattern (User Actions)

- **When:** User input needs to trigger actions
- **How:** Commands encapsulate actions, CommandFactory creates them, KeybindingService routes
- **Example:** Arrow key press → MoveUpCommand → Context.moveOnce() → Trace navigation

### Factory Pattern (Object Creation)

- **When:** Need to instantiate different types based on configuration
- **How:** TraceFactory.create() returns appropriate trace subclass
- **Example:** Parse JSON `type: 'bar'` → `new BarTrace()`

## Debugging Guide

### Common Issues & Where to Look

**Issue: Audio not playing**

1. Check `/src/service/audio.ts:AudioService.update()`
2. Verify `AudioState` in trace's `audio()` method
3. Check if audio is enabled in settings
4. Debug: `console.log('[Audio]', audioState)` in AudioService

**Issue: Text not updating**

1. Check `/src/service/text.ts:TextService.update()`
2. Verify observers are registered in Controller
3. Check Redux state in DevTools
4. Debug: `console.log('[Text]', state)` in TextService

**Issue: Navigation not working**

1. Check trace's `moveOnce()` implementation
2. Verify `isMovable()` returns true
3. Check if `notifyStateUpdate()` is called
4. Debug: Add logging in `AbstractObservableElement.moveOnce()`

**Issue: Keyboard shortcut not working**

1. Check current scope: `console.log(context.scope)`
2. Verify keymap in `/src/service/keybinding.ts`
3. Check if command exists in `/src/command/factory.ts`
4. Debug: Add logging in KeybindingService

### Debugging Tools

**Browser DevTools:**

- **Redux DevTools:** Inspect state changes in real-time
- **Console:** Strategic logging at key points
- **Network:** Check if data is loading correctly
- **Elements:** Inspect SVG elements for highlighting

**Strategic Logging:**

```typescript
// Model layer
console.log('[Model] State before:', this.state);
console.log('[Model] Moving:', direction);
console.log('[Model] State after:', this.state);

// Service layer
console.log('[Service] Received update:', state);
console.log('[Service] Processing:' /* ... */);
console.log('[Service] Emitting event:', event);

// ViewModel layer
console.log('[VM] Event received:', event);
console.log('[VM] Dispatching action:', action);
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# Type checking
npm run type-check
```

**Testing Philosophy:**

- Write tests for complex business logic
- Focus on services and model layer
- UI tests should verify integration, not implementation details
- Test edge cases (empty data, out of bounds, etc.)

## Build & Deployment

```bash
# Development build (with source maps)
npm run dev

# Production build (optimized)
npm run build

# Preview production build
npm run preview
```

**Build outputs to:** `/dist/`

- `maidr.js` - Main JavaScript bundle
- `maidr.css` - Styles
- Source maps for debugging

## Code Review Checklist

Before submitting changes:

- [ ] Follows MVVC architecture (correct layer for changes)
- [ ] Simple, readable code (KISS principle)
- [ ] Root cause understood and documented
- [ ] Only necessary changes made
- [ ] TypeScript types are correct (no `any`)
- [ ] Observers notified if model changes
- [ ] Redux actions dispatched if state changes
- [ ] No console.log statements left in (use proper logging if needed)
- [ ] Build succeeds (`npm run build`)
- [ ] Tests pass (`npm test`)
- [ ] Manual testing completed
- [ ] No unrelated refactoring

## Additional Documentation

For detailed information on specific topics, see:

- **ARCHITECTURE.md** - In-depth architecture documentation
- **PATTERNS.md** - Design patterns reference with examples
- **API.md** - Public API documentation
- **CONTRIBUTING.md** - Contribution guidelines

## Common Commands Reference

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run preview          # Preview production build

# Testing
npm test                 # Run tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npm run type-check       # TypeScript checking

# Linting
npm run lint             # Check code style
npm run lint:fix         # Fix auto-fixable issues

# Cleaning
npm run clean            # Remove dist/ and node_modules/
```

## Key Files Reference

| File                       | Purpose           | When to Modify               |
| -------------------------- | ----------------- | ---------------------------- |
| `src/index.ts`             | Entry point       | Rarely (initialization only) |
| `src/controller.ts`        | Main orchestrator | Adding new services          |
| `src/model/abstract.ts`    | Base classes      | Changing core navigation     |
| `src/model/factory.ts`     | Trace creation    | Adding new plot types        |
| `src/service/*.ts`         | Business logic    | Modifying features           |
| `src/state/viewModel/*.ts` | State bridge      | Adding UI state              |
| `src/ui/*.tsx`             | React components  | UI changes only              |
| `src/type/grammar.ts`      | Input types       | New data structures          |

## Contact & Resources

- **Issues:** https://github.com/xability/maidr/issues
- **Discussions:** https://github.com/xability/maidr/discussions
- **Documentation:** https://xability.github.io/maidr/

---

**Remember:** Debug first, understand fully, keep it simple, follow the architecture.
