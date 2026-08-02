---
description: "Testing"
applyTo: "test/**,e2e_tests/**,jest.config.ts,playwright.config.ts"
---

<!-- Generated from .claude/rules/testing.md by scripts/sync-copilot-instructions.mjs. Do not edit directly. -->

# Testing

Four suites, four purposes.

| Suite         | Runner                         | Location           | Matches                  |
| ------------- | ------------------------------ | ------------------ | ------------------------ |
| **Unit**      | Jest + ts-jest                 | `test/`            | `test/**/*.test.ts`      |
| **Component** | Jest + jsdom + Testing Library | `test/ui/`         | `test/**/*.test.tsx`     |
| **ESM**       | Jest, ESM project              | `test/`            | `test/**/*.esm-test.ts?(x)` |
| **E2E**       | Playwright                     | `e2e_tests/specs/` | `*.spec.ts`              |

The first three are Jest projects in one `jest.config.ts`, so `npm test` runs
them together — but in one Jest process each, spawned in turn by
`scripts/test.js`. They cannot share a process: `jest-resolve` memoises whether
a file is ESM by path alone, ignoring the asking project's
`extensionsToTreatAsEsm`, so the first project to load a shared `src/` module
decides for the other and the loser fails with `Must use import to load ES
Module`. Which one loses depends on scheduling, so the symptom is a suite that
passes alone and fails in company. Adding a project means adding it to
`PROJECTS` in the runner; `test/scripts/testRunnerProjects.test.ts` fails if you
forget, because a project the runner omits simply never runs.

`test/` mirrors `src/` — `test/model/`, `test/service/`, `test/state/`,
`test/command/`, `test/ui/`, `test/util/`, `test/adapters/`. Put a new unit
test in the directory matching the layer it covers.

```bash
npm test              # jest, with coverage, one process per project
npm run test:watch    # jest --watch, `unit` only — pass --selectProjects for another
npm run e2e           # playwright
npm run e2e:ui        # playwright, interactive
```

A watcher does not exit, so watch mode cannot run the projects in sequence and
watches `unit` alone rather than reintroducing the clash. It says so when it
starts. Every other run does the whole set, and does not stop at the first
project to fail — `npm test` is CI's only test step, so stopping early would
hide the rest until someone pushed a fix.

`npm test -- <path>` still works on a file in one project only. One process per
project turns Jest's aggregate "at least one test found" into a per-project
question, so the runner asks Jest what the filter matches before running and
tolerates a project matching nothing only when something matched somewhere. A
filter that matches nothing at all still fails, and so does a project matching
nothing on an unfiltered run.

Coverage is per project, in `coverage/unit` and `coverage/esm`. Read them
separately: `collectCoverageFrom` is repo-wide, so each report scores the whole
of `src/` against the files that one project happens to load, and `coverage/esm`
shows most of the tree at 0%. There is no combined number, and nothing is gated
on one.

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

## Component tests

The default test environment is `node`. A component test opts into a DOM per
file, so the suites that do not need one keep their current start-up cost:

```tsx
/**
 * @jest-environment jsdom
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
// The `/jest-globals` entry point augments the imported `expect`; the bare
// one only augments the ambient global.
import '@testing-library/jest-dom/jest-globals';
```

- Render through `MaidrContext.Provider` with a `ViewModelRegistry` holding
  stub view models. The component then reaches its state the same way it does
  at runtime, and no service or model has to be constructed.
- Type a stub view model as a `Pick` of the real one, listing the members the
  component calls, and cast that. The signatures stay checked, so a rename
  breaks the test instead of drifting past an `as unknown as`.
- Assert the accessibility contract, not the markup: that a live region is in
  the DOM before the text it will carry, that `aria-describedby` resolves to a
  real element, that focus lands where the user left it. Those are the parts
  that break silently.
- A live region announces on the DOM mutation, not on the state update. When
  the behaviour is "this is announced again", observe the region with a
  `MutationObserver` — an assertion on the text alone passes even when nothing
  moved.
- Wrap an interaction whose handler is async in `await act(...)`, so the state
  update it schedules is flushed before the assertions run.
- Silencing a console the code under test writes to on purpose is the one
  exception to cleaning up in `afterEach`: spy at file scope, `mockClear()` per
  test, and restore in `afterAll`. Re-installing per test would let the
  expected-failure cases print on every run.
- jsdom is not a browser and its accessibility tree is not a screen reader.
  These tests catch wiring regressions; they do not replace verification with
  real assistive technology.
- `jsdom` and `@types/jsdom` are separate devDependencies on different major
  lines — DefinitelyTyped has no release matching every jsdom major. Bumping
  one means checking `npm run type-check` still passes, or the break surfaces
  on an unrelated pull request.

## ESM tests

Name a file `*.esm-test.ts` — or `*.esm-test.tsx` to render a component — when
it needs to import an ESM-only package. The `unified`/`remark`/`rehype` stack
is the case that exists, and `react-markdown` is what pulls `TypingEffect` in
with it. The default project compiles to CommonJS, so importing one from a
`.test.ts` fails with `SyntaxError: Unexpected token 'export'`.

- `npm test` runs this project alongside the others; `scripts/test.js` supplies
  the `--experimental-vm-modules` flag Jest needs to import ESM at all.
- Reach for it only when the CommonJS project cannot do the job. It is slower
  to start, and a test that does not need the real stack does not need this.
- Assert on the hast tree rather than serialised HTML. `react-markdown` renders
  the tree to React elements and never produces an HTML string, so the tree is
  the last thing on the path that actually exists.
- The point is checking that markup **survives**, not that a schema names it.
  `markdownSanitize.test.ts` can say the allowlist contains `table`; only this
  project can say a table came out the other end.
- A `.esm-test.tsx` file is a component test that happens to live here, so the
  component rules above apply in full — the `@jest-environment jsdom` docblock,
  the accessibility contract rather than the markup, and a real store when the
  component reads state with `useViewModelState`. What it adds is the last
  step neither of the above reaches: the rendered element's accessible **name**.
  `typingEffect.esm-test.tsx` is the example.
- Anything reachable from a rendered component is loaded as real ESM, where a
  bundler's extensions do not apply — `import { version } from './package.json'`
  is the one that has already bitten, since a JSON module exports only
  `default`. Import JSON as a default and read the field.

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

When a change surfaces a bug that belongs to a different fix, pin it with
`it.failing` and the issue number rather than skipping it or leaving a comment.
The case keeps running, the suite stays green while the bug stands, and the day
the fix lands the case turns red — which is the reminder to delete it and
anything written to work around the bug. Replace it then with a case that
asserts the fixed behaviour, rather than dropping the marker and leaving the
weaker assertion the pin was written to tolerate.
