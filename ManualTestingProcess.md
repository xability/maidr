# Manual Testing Process

Basically, on each chart, test each mode and controls. Text, Sonificiation, and Review modes shouldn't be connected so no need to test against each other, but all controls should be tested with braille on and off.

## Charts

Everything in /user_study_pilot folder

## Modes

BTSR

- Braille mode: B key toggles on / off
- Text modes: T key switches between text modes, verbose / terse / off
- Sonification modes: S key toggles, usually on / off, but some charts also have a combined / separate as well
- Review mode: R key enables an input with the current text output, and then back to your previous spot

## Controls

| Function                                | Key                      |
| --------------------------------------- | ------------------------ |
| Move around plot                        | Arrow keys               |
| Go to the very left right up down       | Ctrl + Arrow key         |
| Select the first element                | Ctrl + Home              |
| Select the last element                 | Ctrl + End               |
| Toggle Braille Mode                     | b                        |
| Toggle Sonification Mode                | s                        |
| Toggle Text Mode                        | t                        |
| Repeat current sound                    | Space                    |
| Auto-play outward in direction of arrow | Ctrl + Shift + Arrow key |
| Auto-play inward in direction of arrow  | Alt + Shift + Arrow key  |
| Stop Auto-play                          | Ctrl                     |
| Auto-play speed up                      | Period                   |
| Auto-play speed down                    | Comma                    |
