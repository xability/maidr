# Rotor-Based Navigation Feature

## Overview

The rotor-based navigation feature provides efficient data exploration similar to iOS VoiceOver rotor functionality. Users can dynamically change the navigation unit without entering separate modes, reducing keystrokes for common exploration tasks.

## Navigation Units

1. **Data point** (default) - Sequential navigation through all data points
2. **Higher value** - Jump to next/previous point with strictly higher value
3. **Lower value** - Jump to next/previous point with strictly lower value

## Keybindings

- **Alt+Shift+Up Arrow**: Cycle to next navigation unit (wrapping)
- **Alt+Shift+Down Arrow**: Cycle to previous navigation unit (wrapping)
- **Arrow Keys** (Up/Down/Left/Right): Move according to current navigation unit

## Usage Example

```
1. User presses Alt+Shift+Up to change from "Data point" to "Higher value"
   → Announces: "Navigation: Higher value"

2. User presses Right Arrow
   → Moves to next data point with higher value (if found)
   → Or announces: "No higher value found forward"

3. User presses Alt+Shift+Up again to change to "Lower value"
   → Announces: "Navigation: Lower value"

4. User presses Left Arrow
   → Moves to previous data point with lower value (if found)
```

## Trace-Specific Behavior

### Candlestick Charts
- Compares Close values by default
- If user has selected a specific segment (Open/High/Low/Close), uses that segment for comparison
- Search direction: forward/backward through candles

### Line Charts (Single/Multiline)
- Compares y-axis values
- For multiline: searches within the current active series only
- Cross-series navigation still uses Page Up/Down

### Heatmaps
- Horizontal movement (Left/Right): compares values within same row
- Vertical movement (Up/Down): compares values within same column
- Uses cell intensity values for comparison

## Backward Compatibility

- Default behavior is unchanged (Data point navigation)
- Existing arrow key navigation preserved when rotor = "Data point"
- No changes to existing APIs or keyboard shortcuts

## Architecture

The implementation follows strict layered architecture:

- **Service Layer**: `RotorNavigationService` manages navigation units and search logic
- **Command Layer**: Enhanced move commands check rotor state before executing
- **Integration**: Event-driven announcements via `NotificationService`
- **Keybinding**: Seamless integration with existing hotkey system

## Technical Details

- **State Management**: Service tracks current navigation unit (stateless design)
- **Search Algorithm**: Directional search with strict inequality (> or <)
- **Edge Cases**: Handles ties, null values, boundaries gracefully
- **Events**: Emits unit changes and "target not found" notifications
- **Performance**: Optimized search with early termination

## Examples of Efficient Navigation

1. **Finding Rising Peaks**: Set rotor to "Higher value", use arrow keys to jump between ascending values
2. **Locating Declines**: Set rotor to "Lower value", efficiently find downward trends
3. **Extrema Analysis**: Quickly identify local maxima/minima without stepping through every point
4. **Comparison Tasks**: Jump between similar value ranges for pattern analysis

This feature significantly improves accessibility and efficiency for users exploring statistical data visualizations.