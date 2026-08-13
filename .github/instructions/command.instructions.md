---
description: "Commands and keybindings"
applyTo: "src/command/**,src/service/keybinding.ts,src/service/commandExecutor.ts,src/service/help.ts"
---

<!-- Generated from .claude/rules/command.md by scripts/sync-copilot-instructions.mjs. Do not edit directly. -->

# Commands and keybindings

User actions are Command objects. Keyboard input never calls a service directly.

```
KeybindingService → CommandExecutor → CommandFactory → Command → Context/Service
```

## The pieces

- **`Command`** — a single `execute(event?: Event): void`. One action per class,
  dependencies injected through the constructor.
- **`CommandFactory`** — maps a command key to an instance. Every new command
  needs a `case` here or it throws.
- **`CommandExecutor`** (`src/service/commandExecutor.ts`) — validates the
  command against the current scope, then executes it.
- **`KeybindingService`** (`src/service/keybinding.ts`) — binds hotkeys per
  scope via `hotkeys-js` and calls `executeCommand`.

## Scopes

Keybindings are registered per scope (`SUBPLOT`, `TRACE`, `BRAILLE`, …), and
`Context` tracks the active one. A key bound only in `TRACE` does nothing while
the user is in `BRAILLE` — if a shortcut "does not work", check the scope before
anything else. A shortcut that should work everywhere must appear in every
relevant keymap.

## Adding a command

1. Create the class in `src/command/`.
2. Add the `case` to `CommandFactory`.
3. Bind the key in `SCOPED_KEYMAP` for **every** scope it applies to, giving
   `key()` a description — an undiscoverable shortcut does not exist for the
   people who need it most.

The help menu is generated from those descriptions, so there is no second list
to update. Pass `helpKey` when the raw hotkey reads badly (`ctrl+,` → `ctrl + ,`)
and `showInHelp: false` for bindings that are plumbing rather than shortcuts a
user would look up, such as a modal's own `Escape`.

Watch for platform modifiers (Cmd vs Ctrl) and for keys already claimed by the
browser or the screen reader.
