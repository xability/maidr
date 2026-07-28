---
description: "Testing"
applyTo: "test/**,e2e_tests/**,jest.config.ts,playwright.config.ts"
---

<!-- Generated from .claude/rules/testing.md by scripts/sync-copilot-instructions.mjs. Do not edit directly. -->

# Testing

Two suites, two purposes.

| Suite         | Runner              | Location                | Matches               |
| ------------- | ------------------- | ----------------------- | --------------------- |
| **Unit**      | Jest + ts-jest      | `test/`                 | `test/**/*.test.ts`    |
| **E2E**       | Playwright          | `e2e_tests/specs/`      | `*.spec.ts`            |

`test/` mirrors `src/` — `test/model/`, `test/service/`, `test/state/`,
`test/command/`, `test/util/`, `test/adapters/`. Put a new unit test in the
directory matching the layer it covers.

```bash
npm test              # jest, with coverage
npm run test:watch    # jest --watch
npm run e2e           # playwright
npm run e2e:ui        # playwright, interactive
```

## Unit tests

- Arrange–Act–Assert, with a blank line between the three sections.
- Name the behaviour, not the method: `should notify observers when moving up`.
- Test through the public surface. Reaching into private fields locks the test
  to the current implementation.
- Mock at the boundary — the Web Audio API, the DOM, an LLM client — not
  internal collaborators.
- Cover the boundaries a trace actually hits: first and last index, empty data,
  single point, and moves that `isMovable()` should reject.
- Clean up anything stateful in `afterEach`, and assert `dispose()` really
  releases what it allocated.

## E2E tests

- Drive the chart the way a user does: keyboard input, then assert the
  announcement, the braille output, and the highlight.
- Use the helpers in `e2e_tests/page-objects/` rather than raw selectors, so a
  DOM change updates one file instead of twenty.
- Add a spec for each new trace type — accessibility regressions surface here
  and almost nowhere else.

## Expectations for a change

New behaviour ships with a test that would have failed before it. A bug fix
ships with a test that reproduces the bug. Run the relevant suite before you
call the work done, and report failures rather than describing them as passing.
