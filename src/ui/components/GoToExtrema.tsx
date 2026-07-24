import type { XValueOption } from '@state/viewModel/goToExtremaViewModel';
import type { ExtremaTarget } from '@type/extrema';
import type { XValue } from '@type/navigation';
import { Close, KeyboardArrowDown } from '@mui/icons-material';
import { Box, IconButton, List, ListItem, ListItemText, TextField, Typography } from '@mui/material';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

// Builds the user-facing label for an extrema target. Used for the visible
// text, the option's aria-label, AND the keyboard-navigation announcements so
// all three stay in sync (e.g. "Max point Value: 8.00 at Nov 3" — including the
// numeric value, which target.label alone omits).
function buildTargetDisplayLabel(target: ExtremaTarget): string {
  const isIntersection = target.type === 'intersection';
  if (isIntersection && target.display) {
    // Prefix tells users whether this is a sampled-point or segment-only crossing.
    const intersectionPrefix = target.intersectionKind === 'point'
      ? 'Point intersection'
      : target.intersectionKind === 'slope'
        ? 'Slope intersection'
        : 'Intersection';
    return `${intersectionPrefix} with ${target.display.otherLines} at ${target.display.coords}`;
  }
  if (isIntersection) {
    // Fallback for intersection without display fields
    return target.label;
  }
  // For min/max, show: "Max point Value: 8.00 at X"
  const labelParts = target.label.split(' at ');
  // Guard against labels without " at " separator
  return labelParts[1]
    ? `${labelParts[0]} Value: ${target.value.toFixed(2)} at ${labelParts[1]}`
    : `${labelParts[0]} Value: ${target.value.toFixed(2)}`;
}

// Helper function to generate styles for target boxes
function getTargetBoxSx(isSelected: boolean): object {
  return {
    'p': 1.5,
    'border': isSelected ? 2 : 1,
    'borderColor': isSelected ? 'primary.main' : 'divider',
    'borderRadius': 1,
    'mb': 0.5,
    'cursor': 'pointer',
    'bgcolor': isSelected ? 'action.selected' : 'transparent',
    'transition': 'all 0.2s ease',
    '&:hover': {
      bgcolor: 'action.hover',
    },
    '&:focus': {
      outline: 'none',
      borderColor: 'primary.main',
      bgcolor: 'action.selected',
    },
  };
}

// Type guard to check if plot supports navigateToExtrema
function hasNavigateToExtrema(plot: unknown): plot is { navigateToExtrema: (target: ExtremaTarget) => void } {
  return plot !== null
    && typeof plot === 'object'
    && 'navigateToExtrema' in plot
    && typeof (plot as any).navigateToExtrema === 'function';
}

/**
 * Fixed X-value dropdown row height in px. Rows are given exactly this height
 * so scroll offsets map 1:1 to option indices for windowed rendering.
 */
const DROPDOWN_ITEM_HEIGHT = 36;
/** Height in px of the X-value dropdown viewport. */
const DROPDOWN_MAX_HEIGHT = 180;
/** Extra rows rendered above/below the visible dropdown window. */
const DROPDOWN_OVERSCAN = 5;

interface TargetOptionRowProps {
  target: ExtremaTarget;
  index: number;
  isSelected: boolean;
  onSelect: (target: ExtremaTarget) => void;
  optionRef: React.Ref<HTMLDivElement> | null;
}

/**
 * One row of the extrema listbox. Memoized so a selection change re-renders
 * only the row losing and the row gaining selection — intersection-heavy
 * layers (e.g. moving averages over a long daily series) produce hundreds of
 * targets, and re-rendering every row on each ArrowUp/ArrowDown made keyboard
 * navigation visibly sluggish.
 */
const TargetOptionRow = React.memo(({ target, index, isSelected, onSelect, optionRef }: TargetOptionRowProps): React.JSX.Element => {
  const displayLabel = buildTargetDisplayLabel(target);

  return (
    <Box
      ref={optionRef}
      id={`extrema-target-${index}`}
      onClick={() => onSelect(target)}
      role="option"
      aria-selected={isSelected}
      aria-label={displayLabel}
      tabIndex={0}
      sx={getTargetBoxSx(isSelected)}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {displayLabel}
      </Typography>
    </Box>
  );
});
TargetOptionRow.displayName = 'TargetOptionRow';

export const GoToExtrema: React.FC = () => {
  const goToExtremaViewModel = useViewModel('goToExtrema');
  const state = useViewModelState('goToExtrema');
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const searchOptionRef = useRef<HTMLDivElement>(null);

  // Search combobox state
  const [inputValue, setInputValue] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState<XValueOption[]>([]);
  const [dropdownSelectedIndex, setDropdownSelectedIndex] = useState(-1);
  const [dropdownScrollTop, setDropdownScrollTop] = useState(0);
  const inputFieldWrapperRef = useRef<HTMLInputElement>(null);
  const inputElRef = useRef<HTMLInputElement>(null); // real input element
  const listboxRef = useRef<HTMLUListElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.focus();
    }
  }, []);

  // Available X values from active trace, each paired with a display label that
  // is x-axis formatted to match the layer's terse text (e.g. "Nov 3" not
  // "2019-11-03"). The raw `value` is preserved for navigation.
  const availableOptions = useMemo(() => {
    return goToExtremaViewModel.getAvailableXValueOptions();
  }, [goToExtremaViewModel]);

  // Keep filtered options in sync. Match against the formatted label AND the
  // raw value so a screen-reader user who hears "Nov 3" can type "Nov", while a
  // user who knows the underlying value can still type the raw "2019-11-03".
  useEffect(() => {
    const query = inputValue.trim().toLowerCase();
    const next = query === ''
      ? availableOptions
      : availableOptions.filter(o =>
          o.label.toLowerCase().includes(query)
          || String(o.value).toLowerCase().includes(query));
    setFilteredOptions(next);
    if (isDropdownOpen) {
      // Clamp against the freshly filtered list so the highlighted index never
      // points past the end after typing a filter. When the filter yields no
      // results, drop to -1 so aria-activedescendant is cleared instead of
      // pointing at a non-existent option-0 (which has no rendered element and
      // would leave a stale highlight that confuses screen readers).
      setDropdownSelectedIndex(prev =>
        next.length === 0 ? -1 : (prev < 0 ? 0 : Math.min(prev, next.length - 1)));
    }
  }, [inputValue, availableOptions, isDropdownOpen]);

  // Compute active option text for announcement via aria-valuetext
  const activeOptionText = dropdownSelectedIndex >= 0 && filteredOptions[dropdownSelectedIndex] !== undefined
    ? filteredOptions[dropdownSelectedIndex].label
    : undefined;

  // TextField slot props for accessibility and functionality
  const textFieldSlotProps = {
    input: {
      'role': 'combobox' as const,
      'aria-autocomplete': 'list' as const,
      'aria-haspopup': 'listbox' as const,
      'aria-controls': 'x-value-listbox',
      'aria-expanded': isDropdownOpen,
      'aria-activedescendant': dropdownSelectedIndex >= 0 ? `option-${dropdownSelectedIndex}` : undefined,
      'aria-valuetext': activeOptionText,
      'aria-label': 'Search and select X value',
      'endAdornment': (
        <IconButton
          aria-label={isDropdownOpen ? 'Close dropdown' : 'Open dropdown'}
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setIsDropdownOpen(!isDropdownOpen);
          }}
        >
          <KeyboardArrowDown />
        </IconButton>
      ),
    },
  };

  // Announce highlighted option via assertive live region for SRs that ignore activedescendant text
  useEffect(() => {
    if (liveRegionRef.current) {
      const text = activeOptionText ?? '';
      liveRegionRef.current.textContent = text;
    }
  }, [dropdownSelectedIndex, activeOptionText]);

  // Auto-scroll and focus management when selection changes. Instant scroll
  // (no smooth behavior): with key repeat, queued smooth-scroll animations
  // lag behind the selection and make navigation feel unresponsive.
  useEffect(() => {
    if (selectedItemRef.current && listContainerRef.current) {
      const listContainer = listContainerRef.current;
      const selectedItem = selectedItemRef.current;

      selectedItem.focus();

      const containerRect = listContainer.getBoundingClientRect();
      const itemRect = selectedItem.getBoundingClientRect();

      if (itemRect.bottom > containerRect.bottom) {
        selectedItem.scrollIntoView({ block: 'end', inline: 'nearest' });
      } else if (itemRect.top < containerRect.top) {
        selectedItem.scrollIntoView({ block: 'start', inline: 'nearest' });
      }
    }
  }, [state.selectedIndex]);

  // Keep the highlighted option inside the dropdown viewport. Direct
  // scrollTop math (not scrollIntoView) because with windowed rendering the
  // target row may not be mounted until the scroll position moves. Layout
  // effect so the row exists before paint — aria-activedescendant must point
  // at a rendered element when the screen reader reads it.
  useLayoutEffect(() => {
    if (isDropdownOpen && dropdownSelectedIndex >= 0 && listboxRef.current) {
      const listbox = listboxRef.current;
      const itemTop = dropdownSelectedIndex * DROPDOWN_ITEM_HEIGHT;
      const itemBottom = itemTop + DROPDOWN_ITEM_HEIGHT;
      if (itemTop < listbox.scrollTop) {
        listbox.scrollTop = itemTop;
      } else if (itemBottom > listbox.scrollTop + listbox.clientHeight) {
        listbox.scrollTop = itemBottom - listbox.clientHeight;
      }
      setDropdownScrollTop(listbox.scrollTop);
    }
  }, [dropdownSelectedIndex, isDropdownOpen]);

  const handleTargetSelect = useCallback((target: ExtremaTarget): void => {
    const activeTrace = goToExtremaViewModel.activeContext?.active;
    if (activeTrace && hasNavigateToExtrema(activeTrace)) {
      activeTrace.navigateToExtrema(target);
    }
    goToExtremaViewModel.hide();
  }, [goToExtremaViewModel]);

  const handleClose = (): void => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = '';
    }
    goToExtremaViewModel.hide();
  };

  // Close the modal on Escape from ANY focus context. This is attached to the
  // modal container so an Escape keydown that bubbles up from the search input,
  // the extrema options, or the dropdown all reach it. It is required because
  // KeybindingService's global `esc` binding (GO_TO_EXTREMA_CLOSE) is suppressed
  // by hotkeys.filter while focus is inside the search <input> — without this
  // handler, Escape is a dead key there. This is the same dialog-level onKeyDown
  // workaround Settings.tsx uses to keep its shortcuts alive inside a text field.
  const handleModalKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      handleClose();
    }
  };

  const handleOptionSelect = (value: XValue): void => {
    const activeTrace = goToExtremaViewModel.activeContext?.active;
    if (activeTrace && hasMoveToXValue(activeTrace)) {
      activeTrace.moveToXValue(value);
      setIsDropdownOpen(false);
      setDropdownSelectedIndex(-1);
      setInputValue('');
      goToExtremaViewModel.hide();
    }
  };

  // Type guard to check if plot supports moveToXValue
  function hasMoveToXValue(plot: unknown): plot is { moveToXValue: (value: XValue) => void } {
    return plot !== null
      && typeof plot === 'object'
      && 'moveToXValue' in plot
      && typeof (plot as any).moveToXValue === 'function';
  }

  const focusSearchInput = (): void => {
    // Prefer focusing the actual input element
    if (inputElRef.current) {
      inputElRef.current.focus();
    } else if (inputFieldWrapperRef.current) {
      (inputFieldWrapperRef.current as unknown as HTMLElement).focus();
    }
  };

  const announceToScreenReader = (message: string): void => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = message;
    }
  };

  const handleListboxKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();

      if (state.selectedIndex === state.targets.length - 1) {
        // If on last extrema option, move to search
        focusSearchInput();
        setIsDropdownOpen(true);
        setDropdownSelectedIndex(0);
        announceToScreenReader('Moved to search. Type to filter X values.');
      } else {
        goToExtremaViewModel.moveDown();
        // Announce the newly selected option (same rich label the row shows).
        const newOption = state.targets[state.selectedIndex + 1];
        if (newOption) {
          announceToScreenReader(`Selected: ${buildTargetDisplayLabel(newOption)}`);
        }
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();

      if (state.selectedIndex === 0) {
        announceToScreenReader('At first extrema option');
      } else {
        goToExtremaViewModel.moveUp();
        // Announce the newly selected option (same rich label the row shows).
        const newOption = state.targets[state.selectedIndex - 1];
        if (newOption) {
          announceToScreenReader(`Selected: ${buildTargetDisplayLabel(newOption)}`);
        }
      }
    } else if (event.key === 'Home') {
      // WAI-ARIA listbox: jump to the first extrema option.
      event.preventDefault();
      event.stopPropagation();
      if (state.targets.length > 0) {
        goToExtremaViewModel.moveToIndex(0);
        const first = state.targets[0];
        if (first) {
          announceToScreenReader(`Selected: ${buildTargetDisplayLabel(first)}`);
        }
      }
    } else if (event.key === 'End') {
      // WAI-ARIA listbox: jump to the last extrema option (not the virtual
      // search option at index targets.length).
      event.preventDefault();
      event.stopPropagation();
      if (state.targets.length > 0) {
        const lastIndex = state.targets.length - 1;
        goToExtremaViewModel.moveToIndex(lastIndex);
        const last = state.targets[lastIndex];
        if (last) {
          announceToScreenReader(`Selected: ${buildTargetDisplayLabel(last)}`);
        }
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();

      if (state.selectedIndex < state.targets.length) {
        const target = state.targets[state.selectedIndex];
        if (target) {
          handleTargetSelect(target);
        }
      }
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (dropdownSelectedIndex >= 0 && filteredOptions[dropdownSelectedIndex] !== undefined) {
        handleOptionSelect(filteredOptions[dropdownSelectedIndex].value);
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      if (filteredOptions.length === 0) {
        // No options to move onto; keep the highlight cleared (aria-activedescendant undefined).
        announceToScreenReader('No search results');
      } else if (dropdownSelectedIndex === filteredOptions.length - 1) {
        announceToScreenReader('At last search result');
      } else {
        setDropdownSelectedIndex(i => Math.min(i + 1, filteredOptions.length - 1));
        // Announce the newly selected search result
        if (filteredOptions[dropdownSelectedIndex + 1]) {
          announceToScreenReader(`Selected: ${filteredOptions[dropdownSelectedIndex + 1].label}`);
        }
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      // If on the first search result (or there are no results to navigate),
      // go back to the main extrema options. `<= 0` also covers the empty-list
      // case where dropdownSelectedIndex is -1, avoiding a stale reset to 0.
      if (dropdownSelectedIndex <= 0) {
        setIsDropdownOpen(false);
        setDropdownSelectedIndex(-1);
        // Get the last selected extrema option's label for announcement.
        // selectedIndex can legitimately sit on the virtual search option
        // (targets.length), so guard the dereference to avoid a TypeError that
        // would abort the focus handoff below.
        const lastSelectedOption = state.targets[state.selectedIndex];
        announceToScreenReader(
          lastSelectedOption
            ? `Returning to extrema options: ${buildTargetDisplayLabel(lastSelectedOption)}`
            : 'Returning to extrema options',
        );
        // Focus back on the selected option
        if (selectedItemRef.current) {
          selectedItemRef.current.focus();
        }
      } else {
        setDropdownSelectedIndex(i => Math.max(0, i - 1));
        // Announce the newly selected search result
        if (filteredOptions[dropdownSelectedIndex - 1]) {
          announceToScreenReader(`Selected: ${filteredOptions[dropdownSelectedIndex - 1].label}`);
        }
      }
    } else if (event.key === 'Home' || event.key === 'End') {
      // Only repurpose Home/End for list navigation when the query is empty.
      // With text present, leave them to the input's native caret-to-start/end
      // so the user can still reposition the caret while editing the query
      // (WAI-ARIA editable combobox behavior). When empty, caret movement is a
      // no-op, so we use the keys to jump to the first/last search result.
      if (inputValue !== '') {
        // Stop the event from bubbling to the enclosing listbox's onKeyDown
        // (this input is nested inside it), which would otherwise preventDefault
        // the native caret move AND jump the extrema selection. We intentionally
        // do NOT preventDefault here, so the input's native caret move still runs.
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation(); // don't also fire the listbox handler
      if (filteredOptions.length === 0) {
        announceToScreenReader('No search results');
      } else {
        const targetIndex = event.key === 'Home' ? 0 : filteredOptions.length - 1;
        setDropdownSelectedIndex(targetIndex);
        announceToScreenReader(`Selected: ${filteredOptions[targetIndex].label}`);
      }
    }
  };

  // Windowed rendering of the X-value dropdown: only rows near the scroll
  // position are mounted, with spacers preserving the scrollbar geometry.
  // The option list holds one entry per data point (thousands for a long
  // daily series), and mounting a DOM node for every one made opening the
  // dropdown and each ArrowUp/ArrowDown re-render take seconds.
  const totalOptionCount = filteredOptions.length;
  const windowCapacity = Math.ceil(DROPDOWN_MAX_HEIGHT / DROPDOWN_ITEM_HEIGHT) + 2 * DROPDOWN_OVERSCAN;
  const firstVisibleOption = Math.max(0, Math.min(
    Math.floor(dropdownScrollTop / DROPDOWN_ITEM_HEIGHT) - DROPDOWN_OVERSCAN,
    totalOptionCount - windowCapacity,
  ));
  const lastVisibleOption = Math.min(totalOptionCount - 1, firstVisibleOption + windowCapacity - 1);
  const visibleOptions = filteredOptions.slice(firstVisibleOption, lastVisibleOption + 1);

  // Manual scrolling can move the highlighted option outside the mounted
  // window. The input's aria-activedescendant must always reference a mounted
  // element, so the highlighted option is kept rendered as an "island" row
  // (with the spacers around it re-split to preserve geometry) rather than
  // moving the user's selection on scroll.
  const activeAboveWindow = dropdownSelectedIndex >= 0 && dropdownSelectedIndex < firstVisibleOption;
  const activeBelowWindow = dropdownSelectedIndex > lastVisibleOption && dropdownSelectedIndex < totalOptionCount;

  const renderDropdownSpacer = (rowCount: number): React.JSX.Element | null =>
    rowCount > 0
      ? <Box component="li" role="presentation" sx={{ height: rowCount * DROPDOWN_ITEM_HEIGHT }} />
      : null;

  const renderDropdownOption = (option: XValueOption, idx: number): React.JSX.Element => (
    <ListItem
      key={`${option.value}-${idx}`}
      id={`option-${idx}`}
      role="option"
      aria-selected={dropdownSelectedIndex === idx}
      aria-label={option.label}
      aria-setsize={totalOptionCount}
      aria-posinset={idx + 1}
      tabIndex={0}
      onClick={() => handleOptionSelect(option.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          handleOptionSelect(option.value);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          setDropdownSelectedIndex(curr => Math.min(curr + 1, filteredOptions.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          setDropdownSelectedIndex(curr => Math.max(curr - 1, 0));
        } else if (e.key === 'Home') {
          // Handle here so the key doesn't bubble to the
          // enclosing extrema listbox (which would jump the
          // wrong list) when focus is on a result item.
          e.preventDefault();
          e.stopPropagation();
          setDropdownSelectedIndex(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          e.stopPropagation();
          setDropdownSelectedIndex(filteredOptions.length - 1);
        }
      }}
      sx={{ 'cursor': 'pointer', 'height': DROPDOWN_ITEM_HEIGHT, 'boxSizing': 'border-box', 'overflow': 'hidden', 'px': 2, 'py': 0, 'bgcolor': dropdownSelectedIndex === idx ? 'action.selected' : 'transparent', '&:hover': { bgcolor: 'action.hover' } }}
    >
      <ListItemText primary={option.label} sx={{ my: 0 }} slotProps={{ primary: { noWrap: true } }} />
    </ListItem>
  );

  // Conditional rendering in JSX, not early return (following codebase pattern)
  return state.visible && state.targets.length > 0
    ? (
        <>
          {/* Backdrop/Overlay */}
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bgcolor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 9999,
            }}
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal Content */}
          <Box
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="go-to-extrema-title"
            aria-describedby="go-to-extrema-description"
            tabIndex={0}
            onKeyDown={handleModalKeyDown}
            sx={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
              p: 3,
              boxShadow: 3,
              zIndex: 10000,
              minWidth: 300,
              maxHeight: '80vh',
              outline: 'none',
            }}
          >
            <Box id="go-to-extrema-title" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" component="h3" sx={{ m: 0, fontWeight: 600 }}>
                Go To
              </Typography>
              <IconButton onClick={handleClose} aria-label="Close dialog" size="small">
                <Close />
              </IconButton>
            </Box>

            <Box id="go-to-extrema-description" sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ m: 0 }}>
                {state.description || 'Navigate to points of interest'}
              </Typography>
            </Box>

            <Box ref={listContainerRef} role="listbox" aria-label="Navigation targets" onKeyDown={handleListboxKeyDown} sx={{ maxHeight: 300, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
              {state.targets.map((target: ExtremaTarget, index: number) => (
                <TargetOptionRow
                  key={`target-${index}-${target.type}-${target.label}`}
                  target={target}
                  index={index}
                  isSelected={state.selectedIndex === index}
                  onSelect={handleTargetSelect}
                  optionRef={index === state.selectedIndex ? selectedItemRef : null}
                />
              ))}

              {/* 4th option: Searchable combobox */}
              {availableOptions.length > 0 && (
                <Box
                  ref={searchOptionRef}
                  id="search-input-option"
                  role="option"
                  aria-selected={state.selectedIndex === state.targets.length}
                  aria-label="Search and navigate to specific X value"
                  aria-expanded={isDropdownOpen}
                  aria-controls="x-value-listbox"
                  tabIndex={0}
                  sx={{ p: 1.5, borderRadius: 1, mb: 0.5, border: state.selectedIndex === state.targets.length ? 2 : 1, borderColor: state.selectedIndex === state.targets.length ? 'primary.main' : 'divider', bgcolor: state.selectedIndex === state.targets.length ? 'action.selected' : 'transparent', position: 'relative' }}
                  onClick={() => {
                    focusSearchInput();
                    setIsDropdownOpen(true);
                    setDropdownSelectedIndex(0);
                  }}
                >
                  <TextField
                    ref={inputFieldWrapperRef}
                    inputRef={inputElRef}
                    label="Search X values"
                    placeholder={`Type to search ${availableOptions.length} values`}
                    fullWidth
                    variant="outlined"
                    size="small"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      setIsDropdownOpen(true);
                      if (dropdownSelectedIndex < 0) {
                        setDropdownSelectedIndex(0);
                      }
                    }}
                    onFocus={() => {
                      setIsDropdownOpen(true);
                      if (dropdownSelectedIndex < 0) {
                        setDropdownSelectedIndex(0);
                      }
                    }}
                    onKeyDown={handleInputKeyDown}
                    slotProps={textFieldSlotProps}
                  />

                  {isDropdownOpen && filteredOptions.length > 0 && (
                    <List
                      ref={listboxRef}
                      id="x-value-listbox"
                      role="listbox"
                      aria-label="Available X values"
                      aria-hidden={!isDropdownOpen}
                      disablePadding
                      onScroll={(event: React.UIEvent<HTMLUListElement>) => setDropdownScrollTop(event.currentTarget.scrollTop)}
                      sx={{ position: 'absolute', top: '100%', left: 0, right: 0, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: DROPDOWN_MAX_HEIGHT, overflowY: 'auto', zIndex: 2, boxShadow: 2, mt: 0.5 }}
                    >
                      {/* Rows above the window: plain spacer, or spacer + highlighted-option island + spacer */}
                      {activeAboveWindow
                        ? (
                            <>
                              {renderDropdownSpacer(dropdownSelectedIndex)}
                              {renderDropdownOption(filteredOptions[dropdownSelectedIndex], dropdownSelectedIndex)}
                              {renderDropdownSpacer(firstVisibleOption - dropdownSelectedIndex - 1)}
                            </>
                          )
                        : renderDropdownSpacer(firstVisibleOption)}
                      {visibleOptions.map((option, offset) => renderDropdownOption(option, firstVisibleOption + offset))}
                      {/* Rows below the window: plain spacer, or spacer + highlighted-option island + spacer */}
                      {activeBelowWindow
                        ? (
                            <>
                              {renderDropdownSpacer(dropdownSelectedIndex - lastVisibleOption - 1)}
                              {renderDropdownOption(filteredOptions[dropdownSelectedIndex], dropdownSelectedIndex)}
                              {renderDropdownSpacer(totalOptionCount - 1 - dropdownSelectedIndex)}
                            </>
                          )
                        : renderDropdownSpacer(totalOptionCount - 1 - lastVisibleOption)}
                    </List>
                  )}
                  {/* Assertive live region for immediate announcement of highlighted option */}
                  <div
                    ref={liveRegionRef}
                    id="sr-active-option-announcer"
                    aria-live="assertive"
                    aria-atomic="true"
                    style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}
                  />
                </Box>
              )}
            </Box>
          </Box>
        </>
      )
    : null;
};
