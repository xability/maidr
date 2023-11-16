# Manual Testing Process

Basically, on each chart and in each mode, test all controls.

## Charts

Everything in /user_study_pilot folder

## Modes

BTSR

- Braille mode: B key toggles on / off
- Text modes: T key switches between text modes, verbose / terse / off
- Sonification modes: S key toggles, usually on / off, but some charts also have a combined / separate as well
- Review mode: R key enables an input with the current text output, and then back to your previous spot

## Controls

| Function                                | Key                                      |
| --------------------------------------- | ---------------------------------------- |
| Move around plot                        | Arrow keys                               |
| Go to the very left right up down       | ${constants.control} + Arrow key         |
| Select the first element                | ${constants.control} + ${constants.home} |
| Select the last element                 | ${constants.control} + ${constants.end}  |
| Toggle Braille Mode                     | b                                        |
| Toggle Sonification Mode                | s                                        |
| Toggle Text Mode                        | t                                        |
| Repeat current sound                    | Space                                    |
| Auto-play outward in direction of arrow | ${constants.control} + Shift + Arrow key |
| Auto-play inward in direction of arrow  | ${constants.alt} + Shift + Arrow key     |
| Stop Auto-play                          | ${constants.control}                     |
| Auto-play speed up                      | Period                                   |
| Auto-play speed down                    | Comma                                    |
