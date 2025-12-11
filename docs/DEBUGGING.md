# MAIDR Debugging Guide

A practical guide for debugging common issues in MAIDR.

## Table of Contents

1. [General Debugging Strategy](#general-debugging-strategy)
2. [Common Issues](#common-issues)
3. [Debugging by Layer](#debugging-by-layer)
4. [Debugging Tools](#debugging-tools)
5. [Logging Best Practices](#logging-best-practices)

---

## General Debugging Strategy

### The Debug-First Workflow

**NEVER jump to implementing a fix. Always follow this process:**

```
1. REPRODUCE
   - Understand exact steps to trigger the issue
   - Document what you observe vs. what you expect

2. ISOLATE
   - Which layer is the problem in? (Model, Service, ViewModel, View)
   - Which component/file is involved?

3. TRACE
   - Add strategic console.log statements
   - Use browser DevTools debugger with breakpoints
   - Follow the data flow

4. UNDERSTAND ROOT CAUSE
   - WHY is this happening?
   - What is the current code trying to do?
   - What assumption is wrong?

5. VERIFY UNDERSTANDING
   - Confirm your hypothesis with targeted tests
   - Check if similar patterns exist elsewhere

6. DESIGN MINIMAL FIX
   - What's the simplest change that fixes the root cause?
   - Does it follow MVVC architecture?
   - Does it maintain existing patterns?

7. IMPLEMENT & TEST
   - Make the change
   - Verify the fix works
   - Check for regressions
```

### Example: Audio Not Playing

**❌ BAD Approach:**

```typescript
// User reports: "Audio doesn't play"
// Developer immediately changes AudioService without understanding why
class AudioService {
  play(value: number) {
    // Just added this without debugging
    if (!value)
      return; // Maybe this fixes it?
    // ...
  }
}
```

**✅ GOOD Approach:**

```typescript
// 1. REPRODUCE: Navigate to a bar chart, press arrow key
// 2. ISOLATE: Audio should play but doesn't

// 3. TRACE: Add logging
class BarTrace {
  moveOnce(direction: MovableDirection) {
    console.log('[Trace] Before move:', { row: this.row, value: this.currentPoint.y });
    this.row += 1;
    console.log('[Trace] After move:', { row: this.row, value: this.currentPoint.y });
    console.log('[Trace] Notifying observers:', this.observers.length);
    this.notifyStateUpdate();
  }
}

class AudioService {
  update(state: TraceState) {
    console.log('[Audio] Received update:', state);
    console.log('[Audio] Audio state:', state.audio);

    const audioState = state.audio;
    console.log('[Audio] Playing value:', audioState.value);
    this.play(audioState.value);
  }

  play(value: number) {
    console.log('[Audio] play() called with:', value);
    // ... actual play logic
  }
}

// 4. UNDERSTAND: Check console output
// Found: AudioService.update() is never called!
// Root cause: Observer not registered in Controller

// 5. VERIFY: Check Controller.registerObservers()
// Confirmed: this.trace.addObserver(this.audioService) is missing

// 6. FIX: Add the missing observer registration
private registerObservers(): void {
  for (const trace of this.getAllTraces()) {
    trace.addObserver(this.audioService);  // ← Add this line
  }
}
```

---

## Common Issues

### Issue 1: Audio Not Playing

**Symptoms:**

- Navigation works but no sound
- No errors in console

**Debug Steps:**

1. **Check if AudioService receives updates:**

   ```typescript
   // Add to AudioService.update()
   console.log('[Audio] update() called:', state);
   ```

2. **If NOT receiving updates:** Observer not registered

   ```typescript
   // Check Controller.registerObservers()
   // Ensure: trace.addObserver(this.audioService)
   ```

3. **If receiving updates:** Check AudioState

   ```typescript
   console.log('[Audio] audioState:', state.audio);
   // Verify: value, min, max are correct numbers
   ```

4. **Check audio is enabled:**

   ```typescript
   console.log('[Audio] enabled:', this.enabled);
   console.log('[Audio] mode:', this.mode);
   ```

5. **Check Web Audio API:**
   ```typescript
   console.log('[Audio] audioContext state:', this.audioContext.state);
   // Should be 'running', not 'suspended'
   ```

**Common Root Causes:**

- Observer not registered in Controller
- Audio mode set to OFF
- AudioContext suspended (need user interaction to resume)
- Value is NaN or undefined

**Fix Pattern:**

```typescript
// Verify all traces have audio observer
private registerObservers(): void {
  for (const subplot of this.figure.subplots.flat()) {
    for (const trace of subplot.traces.flat()) {
      trace.addObserver(this.audioService);  // ✅ Ensure this exists
    }
  }
}
```

---

### Issue 2: Text Not Updating

**Symptoms:**

- Navigation works but text description doesn't change
- Old text displayed

**Debug Steps:**

1. **Check if TextService receives updates:**

   ```typescript
   // Add to TextService.update()
   console.log('[Text] update() called:', state);
   ```

2. **Check if event is fired:**

   ```typescript
   // Add to TextService.update()
   const text = this.generateDescription(state);
   console.log('[Text] Generated text:', text);
   console.log('[Text] Firing onChange event');
   this.onChangeEmitter.fire({ value: text });
   ```

3. **Check if ViewModel receives event:**

   ```typescript
   // Add to TextViewModel constructor
   this.disposables.push(
     textService.onChange((e) => {
       console.log('[TextVM] Received event:', e);
       this.store.dispatch(update(e.value));
     })
   );
   ```

4. **Check Redux state:**

   ```typescript
   // In browser console or Redux DevTools
   console.log(store.getState().text);
   ```

5. **Check React component:**
   ```typescript
   // Add to Text component
   const state = useViewModelState('text');
   console.log('[Text Component] Rendering with:', state);
   ```

**Common Root Causes:**

- Observer not registered
- Event listener not added in ViewModel
- Redux action not dispatched
- Component not subscribed to state

---

### Issue 3: Navigation Not Working

**Symptoms:**

- Arrow keys don't move position
- Position stuck at 0

**Debug Steps:**

1. **Check if keyboard event is received:**

   ```typescript
   // Add to KeybindingService
   register(scope: Scope): void {
     hotkeys('up', scope, (event) => {
       console.log('[Keybinding] Up key pressed');
       event.preventDefault();
       this.commandExecutor.executeCommand('MOVE_UP', event);
     });
   }
   ```

2. **Check if command executes:**

   ```typescript
   // Add to CommandExecutor
   executeCommand(commandKey: Keys, event?: Event): void {
     console.log('[Executor] Executing:', commandKey);
     const command = this.commandFactory.create(commandKey);
     console.log('[Executor] Command:', command);
     command.execute(event);
   }
   ```

3. **Check if Context delegates:**

   ```typescript
   // Add to Context.moveOnce()
   moveOnce(direction: MovableDirection): void {
     console.log('[Context] moveOnce called:', direction);
     console.log('[Context] Active plot:', this.active);
     console.log('[Context] Current position:', { row: this.active.row, col: this.active.col });
     this.active.moveOnce(direction);
   }
   ```

4. **Check if Trace updates:**

   ```typescript
   // Add to Trace.moveOnce()
   moveOnce(direction: MovableDirection): void {
     console.log('[Trace] Before:', { row: this.row, col: this.col });
     console.log('[Trace] isMovable?', this.isMovable(direction));

     if (direction === 'UPWARD' && this.isMovable('UPWARD')) {
       this.row += 1;
     }

     console.log('[Trace] After:', { row: this.row, col: this.col });
     this.notifyStateUpdate();
   }
   ```

**Common Root Causes:**

- Keybindings not registered (wrong scope)
- `isMovable()` returning false
- Position not updating
- `notifyStateUpdate()` not called

**Fix Pattern:**

```typescript
// Ensure isMovable checks bounds correctly
isMovable(direction: MovableDirection): boolean {
  if (direction === 'UPWARD') {
    return this.row < this.values.length - 1;  // Check boundary
  }
  // ... other directions
}
```

---

### Issue 4: Keyboard Shortcut Not Working

**Symptoms:**

- Specific key combo doesn't work
- Other keys work fine

**Debug Steps:**

1. **Check current scope:**

   ```typescript
   console.log('[Context] Current scope:', context.scope);
   ```

2. **Check keymap for that scope:**

   ```typescript
   // In keybinding.ts
   const keymap = SCOPED_KEYMAP[scope];
   console.log('[Keybinding] Keymap for scope:', keymap);
   ```

3. **Check if key is registered:**

   ```typescript
   // Check if 'MOVE_UP' exists in keymap
   console.log('[Keybinding] MOVE_UP hotkey:', keymap.MOVE_UP);
   ```

4. **Test hotkey directly:**
   ```typescript
   // In browser console
   hotkeys('up', () => console.log('Up key works!'));
   ```

**Common Root Causes:**

- Wrong scope (e.g., in BRAILLE scope, but keymap defined for TRACE)
- Key already bound in another library
- Platform-specific modifier (Cmd vs Ctrl)

**Fix Pattern:**

```typescript
// Add key to correct scope
const TRACE_KEYMAP = {
  MOVE_UP: 'up', // ✅ Available in TRACE scope
  MOVE_DOWN: 'down',
  // ...
};

const BRAILLE_KEYMAP = {
  MOVE_UP: 'up', // ✅ Also available in BRAILLE scope
  // ...
};
```

---

### Issue 5: SVG Highlighting Not Working

**Symptoms:**

- Visual highlight not appearing
- Hover not working

**Debug Steps:**

1. **Check if HighlightService receives updates:**

   ```typescript
   // Add to HighlightService.update()
   update(state: TraceState): void {
     console.log('[Highlight] update() called:', state);
     console.log('[Highlight] highlightValues:', state.highlight?.values);
   }
   ```

2. **Check if SVG elements exist:**

   ```typescript
   const elements = state.highlight?.values;
   console.log('[Highlight] Elements:', elements);
   console.log('[Highlight] Current element:', elements?.[state.row]?.[state.col]);
   ```

3. **Check element selector:**

   ```typescript
   // In trace constructor
   console.log('[Trace] Selector:', this.selector);
   const elements = document.querySelectorAll(this.selector);
   console.log('[Trace] Found elements:', elements.length);
   ```

4. **Check element visibility:**
   ```typescript
   const element = elements[row][col];
   console.log('[Highlight] Element style:', element?.style);
   console.log('[Highlight] Element classList:', element?.classList);
   ```

**Common Root Causes:**

- Wrong CSS selector (no elements found)
- SVG elements not in DOM yet
- Element reference lost (DOM regenerated)
- Style not applied correctly

**Fix Pattern:**

```typescript
// Ensure selector matches actual SVG structure
const selector = this.layer.selectors;
console.log('[Debug] Selector:', selector);

const elements = plot.querySelectorAll(selector);
console.log('[Debug] Found elements:', elements.length);

if (elements.length === 0) {
  console.warn('No elements found for selector:', selector);
  // Check actual DOM structure and fix selector
}
```

---

## Debugging by Layer

### Model Layer (`/src/model/`)

**What to check:**

- Is `notifyStateUpdate()` called after state changes?
- Is `isMovable()` returning correct values?
- Are row/col indices within bounds?
- Is data parsed correctly from JSON?

**Debug pattern:**

```typescript
class BarTrace {
  moveOnce(direction: MovableDirection): void {
    console.log('[MODEL] Current state:', {
      row: this.row,
      col: this.col,
      direction,
      isMovable: this.isMovable(direction),
      valuesLength: this.values.length
    });

    // Move logic
    if (this.isMovable(direction)) {
      this.row += 1;
    }

    console.log('[MODEL] New state:', { row: this.row, col: this.col });
    console.log('[MODEL] Observers to notify:', this.observers.length);

    this.notifyStateUpdate();
  }
}
```

### Service Layer (`/src/service/`)

**What to check:**

- Is `update(state)` called when expected?
- Are events fired correctly?
- Are resources cleaned up in `dispose()`?

**Debug pattern:**

```typescript
class AudioService {
  update(state: TraceState): void {
    console.log('[SERVICE] AudioService.update called');
    console.log('[SERVICE] State:', state);
    console.log('[SERVICE] Enabled:', this.enabled);
    console.log('[SERVICE] Mode:', this.mode);

    if (!this.enabled || this.mode === AudioMode.OFF) {
      console.log('[SERVICE] Audio disabled or off');
      return;
    }

    const audioState = state.audio;
    console.log('[SERVICE] AudioState:', audioState);

    this.play(audioState.value);
  }

  private play(value: number): void {
    console.log('[SERVICE] play() called:', value);
    // ... play logic
  }
}
```

### ViewModel Layer (`/src/state/viewModel/`)

**What to check:**

- Are event listeners registered?
- Are Redux actions dispatched?
- Are disposables cleaned up?

**Debug pattern:**

```typescript
class TextViewModel extends AbstractViewModel<TextState> {
  constructor(store: AppStore, textService: TextService) {
    super(store);

    console.log('[VIEWMODEL] TextViewModel constructor');

    this.disposables.push(
      textService.onChange((e) => {
        console.log('[VIEWMODEL] Event received:', e);
        console.log('[VIEWMODEL] Dispatching action');
        this.store.dispatch(update(e.value));
        console.log('[VIEWMODEL] New state:', this.store.getState().text);
      })
    );
  }
}
```

### View Layer (`/src/ui/`)

**What to check:**

- Is component receiving correct state?
- Is re-render triggered?
- Are event handlers called?

**Debug pattern:**

```typescript
export const Text: React.FC = () => {
  const state = useViewModelState('text');

  console.log('[VIEW] Text component rendering');
  console.log('[VIEW] State:', state);

  useEffect(() => {
    console.log('[VIEW] State changed:', state);
  }, [state]);

  return (
    <div>
      <p aria-live={state.announce ? 'assertive' : 'off'}>
        {state.value}
      </p>
    </div>
  );
};
```

---

## Debugging Tools

### 1. Browser DevTools

**Console:**

- Strategic `console.log` statements
- Group related logs: `console.group('[Audio]')`
- Use colors: `console.log('%c[Audio]', 'color: blue', data)`

**Debugger:**

- Set breakpoints in Sources tab
- Inspect variables at breakpoint
- Step through execution

**Redux DevTools:**

- Install Redux DevTools extension
- View all state changes in real-time
- Time-travel debugging

**Elements:**

- Inspect SVG elements
- Check computed styles
- Verify DOM structure

### 2. TypeScript Compiler

```bash
# Check types without building
npm run type-check

# Watch mode
npm run type-check -- --watch
```

### 3. React DevTools

- Inspect component tree
- View component props and state
- Profile component renders

---

## Logging Best Practices

### Strategic Logging

**DO:**

```typescript
// Log at key decision points
console.log('[Trace] moveOnce:', { direction, isMovable: this.isMovable(direction) });

// Log state before/after changes
console.log('[Before]', this.state);
this.doSomething();
console.log('[After]', this.state);

// Use prefixes for grep-ability
console.log('[Audio]', data); // Easy to filter
console.log('[Model]', data);
```

**DON'T:**

```typescript
// ❌ Too verbose
console.log('x');
console.log('y');
console.log('z');

// ❌ No context
console.log(data);

// ❌ In tight loops
for (let i = 0; i < 10000; i++) {
  console.log(i); // Slows down app
}
```

### Remove Logs Before Commit

```bash
# Search for console.log
grep -r "console.log" src/

# Or use ESLint rule
# "no-console": "warn"
```

### Production Logging

For production, use a logging service or conditional logging:

```typescript
// util/logger.ts
const DEBUG = process.env.NODE_ENV === 'development';

export const logger = {
  debug: (...args: any[]) => {
    if (DEBUG)
      console.log(...args);
  },
  warn: (...args: any[]) => {
    console.warn(...args);
  },
  error: (...args: any[]) => {
    console.error(...args);
    // Send to error tracking service
  }
};

// Usage
logger.debug('[Audio] Playing:', value);
```

---

## Checklist: Before Asking for Help

Before asking others for help, ensure you've:

- [ ] Reproduced the issue consistently
- [ ] Added strategic logging to trace execution
- [ ] Checked console for errors
- [ ] Verified which layer the issue is in (Model/Service/ViewModel/View)
- [ ] Checked if observers are registered (for Model issues)
- [ ] Checked if events are fired (for Service issues)
- [ ] Checked Redux state (for ViewModel issues)
- [ ] Checked component props (for View issues)
- [ ] Read surrounding code to understand context
- [ ] Searched codebase for similar patterns
- [ ] Verified types with `npm run type-check`
- [ ] Tested in different scenarios

**When asking for help, provide:**

1. Exact steps to reproduce
2. Expected vs actual behavior
3. Relevant code snippets
4. Console output with logging
5. What you've already tried

---

Remember: **Debug first, understand fully, then implement the minimal fix.**
