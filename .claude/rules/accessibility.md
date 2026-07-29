---
paths:
  - "src/ui/**"
  - "src/service/audio.ts"
  - "src/service/audioPalette.ts"
  - "src/service/braille.ts"
  - "src/service/text.ts"
  - "src/service/description.ts"
  - "src/service/notification.ts"
  - "src/service/highlight.ts"
  - "src/service/highContrast.ts"
  - "src/service/keybinding.ts"
---

# Accessibility requirements

MAIDR exists so that blind and low-vision users can read statistical graphics.
Accessibility is the product, not a checklist appended to it. A change that
looks right visually but drops an announcement is a regression.

## The four modalities

Every data representation must be reachable through all four:

| Modality      | Service                          | Failure mode if skipped                      |
| ------------- | -------------------------------- | -------------------------------------------- |
| **Audio**     | `audio.ts`, `audioPalette.ts`     | Values become unreadable by ear               |
| **Text**      | `text.ts`, `description.ts`       | Screen reader announces nothing               |
| **Braille**   | `braille.ts`                      | Refreshable braille displays show stale data  |
| **Highlight** | `highlight.ts`                    | Sighted-with-low-vision users lose their place|

When you add a trace type or a navigation mode, verify all four produce
meaningful output for it.

## Screen reader announcements

- Route announcements through `NotificationService` rather than writing to DOM
  nodes by hand.
- Use `aria-live="assertive"` only for the user's own navigation result. Use
  `polite` for background status so it does not interrupt them mid-sentence.
- Keep announcements terse-mode-aware: verbose text is helpful on demand and
  exhausting on every arrow key.
- Announce position and context, not just a bare value —
  "Bar 5 of 10, January: 45.2" beats "45.2".

## Keyboard

- Every interaction must be reachable without a pointer, and every new shortcut
  must be added to `src/service/help.ts`.
- Do not trap focus. Anything that opens must close with `Escape` and return
  focus to where the user was.
- Keep visible focus indicators intact; never set `outline: none` without an
  equivalent replacement.
- Respect the active scope so shortcuts do not collide across modes
  (see `rules/command.md`).

## Markup and visuals

- Label every control. Prefer a real accessible name over `title`.
- Use semantic elements first; add `role` only when no element fits.
- Do not put interactive handlers on non-interactive elements.
- Target WCAG 2.1 AA contrast, and check changes against
  `src/service/highContrast.ts`.
- Never convey information by colour alone — pair it with text, shape, or tone.

## Audio

- Resume a suspended `AudioContext` from a user gesture before playing; browsers
  block autoplay and the failure is silent.
- Keep pitch mapping bounded so outliers cannot produce painful frequencies.
- Stop and clean up oscillators in `dispose()`.
