---
description: "TypeScript conventions"
applyTo: "src/**/*.ts,src/**/*.tsx,test/**/*.ts,e2e_tests/**/*.ts"
---

<!-- Generated from .claude/rules/typescript.md by scripts/sync-copilot-instructions.mjs. Do not edit directly. -->

# TypeScript conventions

## Types

- **No `any`.** Use `unknown` with a type guard, a generic, a union, or a proper
  interface. If a third-party type forces it, narrow at the boundary and keep
  `any` out of the surrounding code.
- Explicit return types on exported functions and public methods.
- `interface` for object shapes, `type` for unions, intersections, and utilities.
- Discriminated unions for state variants; keep the `switch` exhaustive.
- `readonly` for data that must not be mutated after construction.
- Shared domain types live in `src/type/`; input grammar types in
  `src/type/grammar.ts`.
- Avoid non-null assertions (`!`). Narrow instead, or handle the null case.
- Barrel `index.ts` files belong at module boundaries only — `src/adapters/*/`
  is the established case. Do not add one inside a module.

## Style

- Single quotes, 2-space indent, semicolons, trailing commas.
- `camelCase` for variables and functions, `PascalCase` for classes and types,
  `kebab-case` or `camelCase` filenames to match the directory you are in.
- One class per file.
- Early returns over nested conditionals; keep functions short and
  single-purpose.
- JSDoc on public APIs — `@param`, `@returns`, `@throws` where they apply.

## Errors and logging

- Handle errors where you catch them. Never swallow one silently.
- Include context when logging: `console.error('[AudioService] …', error)`.
- No leftover `console.log` in committed code. Temporary tracing is fine while
  debugging; remove it before you finish.

## Verify before finishing

```bash
npm run type-check   # tsc, no emit
npm run lint:fix     # eslint --fix
npm run build        # must succeed
```

Do not move on to the next piece of work while the current one fails to
type-check.
