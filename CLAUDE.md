# MAIDR - Development Guide

## Project Overview

**MAIDR** (Multimodal Access and Interactive Data Representation) provides accessible, non-visual access to statistical visualizations through **audio sonification, text descriptions, braille output, and AI-powered descriptions**.

**Tech Stack:** TypeScript, React, Redux Toolkit, Web Audio API, Vite

## Quick Start

```bash
npm install          # Install dependencies
npm run dev          # Start dev server
npm run build        # Production build
npm run lint:fix     # Fix lint issues
npm test             # Run tests
```

## Architecture (MVVC Pattern)

```
VIEW (React)  ←→  VIEWMODEL (Redux)  ←→  SERVICES  ←→  MODEL
   /src/ui/       /src/state/viewModel/   /src/service/   /src/model/
```

**Data Flow:** User Input → Command → Context → Model → Observers → Services → ViewModels → Redux → React

For detailed architecture, see: @.claude/ARCHITECTURE.md

## Core Principles

### 1. KISS (Keep It Simple)
- Simple, readable code over clever solutions
- Break complex functions into smaller, single-purpose ones
- Avoid unnecessary abstractions

### 2. Follow MVVC Architecture
- **Model:** Data and navigation only. No UI concerns.
- **ViewModel:** Bridge Services ↔ UI. Dispatches Redux actions.
- **View:** Renders state. No business logic.
- **Services:** Business logic, side effects.

### 3. Debug First, Then Implement
1. Reproduce the issue
2. Trace with strategic logging
3. Find root cause
4. Understand context
5. Design minimal fix
6. Implement & test

For debugging guide, see: @.claude/DEBUGGING.md

### 4. Minimal, Focused Changes
- One logical change per commit
- Change only what's necessary
- Preserve existing patterns

## Key Design Patterns

| Pattern | Purpose | Location |
|---------|---------|----------|
| Observer | Model → Service updates | Model notifies, Services listen |
| Command | User action encapsulation | `/src/command/` |
| Factory | Trace type creation | `/src/model/factory.ts` |
| Emitter | Service → ViewModel events | Services fire, ViewModels listen |

For detailed patterns, see: @.claude/PATTERNS.md

## File Structure

```
maidr/
├─ src/
│  ├─ index.ts              # Entry point
│  ├─ controller.ts         # Orchestrates services
│  ├─ model/                # Domain data & navigation
│  ├─ service/              # Business logic (Audio, Text, Braille...)
│  ├─ command/              # Command pattern
│  ├─ state/viewModel/      # Redux bridge
│  ├─ ui/                   # React components
│  ├─ type/                 # TypeScript types
│  └─ util/                 # Utilities
├─ .claude/                 # Detailed documentation
│  ├─ ARCHITECTURE.md       # Architecture deep-dive
│  ├─ PATTERNS.md           # Design patterns reference
│  └─ DEBUGGING.md          # Debugging guide
├─ CLAUDE.md                # This file
└─ CONTRIBUTING.md          # Contribution guidelines
```

## Common Tasks

### Adding a New Plot Type
1. Create trace class in `/src/model/trace/`
2. Register in `TraceFactory` (`/src/model/factory.ts`)
3. Define type in `/src/type/grammar.ts`

### Adding a New Service
1. Create service in `/src/service/` implementing `Observer<State>`
2. Register in Controller (`/src/controller.ts`)
3. Create ViewModel if UI state needed

### Modifying Navigation
1. Find trace class in `/src/model/trace/`
2. Override `moveOnce()` method
3. Always call `this.notifyStateUpdate()`

## Key Files Reference

| File | Purpose | When to Modify |
|------|---------|----------------|
| `src/index.ts` | Entry point | Rarely |
| `src/controller.ts` | Orchestrator | Adding services |
| `src/model/factory.ts` | Trace creation | Adding plot types |
| `src/service/*.ts` | Business logic | Feature changes |
| `src/state/viewModel/*.ts` | State bridge | UI state changes |
| `src/ui/*.tsx` | React components | UI changes |
| `src/type/grammar.ts` | Input types | New data structures |

## Commands Reference

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run preview          # Preview build

# Testing
npm test                 # Run tests
npm run e2e              # End-to-end tests
npm run type-check       # TypeScript check

# Code Quality
npm run lint             # Check code style
npm run lint:fix         # Auto-fix issues

# Documentation
npm run docs             # Build docs site
npm run docs:serve       # Preview docs locally
```

## Code Review Checklist

- [ ] Follows MVVC architecture
- [ ] Simple, readable code (KISS)
- [ ] Root cause understood
- [ ] Only necessary changes
- [ ] No `any` types
- [ ] Observers notified on model changes
- [ ] Build succeeds (`npm run build`)
- [ ] Tests pass (`npm test`)

---

**Remember:** Debug first, understand fully, keep it simple, follow the architecture.
