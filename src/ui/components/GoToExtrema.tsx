import type { XValueOption } from '@state/viewModel/goToExtremaViewModel';
import type { ExtremaTarget } from '@type/extrema';
import type { XValue } from '@type/navigation';
import { Close, KeyboardArrowDown } from '@mui/icons-material';
import { Box, IconButton, List, ListItem, ListItemText, TextField, Typography } from '@mui/material';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import React, { useEffect, useMemo, useRef, useState } from 'react';

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
      // points past the end after typing a filter (which would blank out the
      // highlight and the aria-activedescendant announcement).
      setDropdownSelectedIndex(prev => (prev < 0 ? 0 : Math.min(prev, Math.max(0, next.length - 1))));
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

  // Auto-scroll and focus management when selection changes
  useEffect(() => {
    if (selectedItemRef.current && listContainerRef.current) {
      const listContainer = listContainerRef.current;
      const selectedItem = selectedItemRef.current;

      selectedItem.focus();

      const containerRect = listContainer.getBoundingClientRect();
      const itemRect = selectedItem.getBoundingClientRect();

      if (itemRect.bottom > containerRect.bottom) {
        selectedItem.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
      } else if (itemRect.top < containerRect.top) {
        selectedItem.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
      }
    }
  }, [state.selectedIndex]);

  // Ensure dropdown option stays visible
  useEffect(() => {
    if (isDropdownOpen && dropdownSelectedIndex >= 0 && listboxRef.current) {
      const el = listboxRef.current.querySelector(`#option-${dropdownSelectedIndex}`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [dropdownSelectedIndex, isDropdownOpen]);

  const handleTargetSelect = (target: ExtremaTarget): void => {
    const activeTrace = goToExtremaViewModel.activeContext?.active;
    if (activeTrace && hasNavigateToExtrema(activeTrace)) {
      activeTrace.navigateToExtrema(target);
    }
    goToExtremaViewModel.hide();
  };

  // Type guard to check if plot supports navigateToExtrema
  function hasNavigateToExtrema(plot: unknown): plot is { navigateToExtrema: (target: ExtremaTarget) => void } {
    return plot !== null
      && typeof plot === 'object'
      && 'navigateToExtrema' in plot
      && typeof (plot as any).navigateToExtrema === 'function';
  }

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
  // handler, Escape is a dead key there (mirrors Settings.tsx's dialog handler).
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
      if (dropdownSelectedIndex === filteredOptions.length - 1) {
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
      // If on first search result, go back to main options
      if (dropdownSelectedIndex === 0) {
        setIsDropdownOpen(false);
        setDropdownSelectedIndex(-1);
        // Get the last selected extrema option's label for announcement.
        // selectedIndex can legitimately sit on the virtual search option
        // (targets.length), so guard the dereference to avoid a TypeError that
        // would abort the focus handoff below.
        const lastSelectedOption = state.targets[state.selectedIndex];
        announceToScreenReader(
          lastSelectedOption
            ? `Returning to extrema options: ${lastSelectedOption.label}`
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
              {state.targets.map((target: ExtremaTarget, index: number) => {
                const displayLabel = buildTargetDisplayLabel(target);

                return (
                  <Box
                    key={`target-${index}-${target.type}-${target.label}`}
                    ref={index === state.selectedIndex ? selectedItemRef : null}
                    id={`extrema-target-${index}`}
                    onClick={() => handleTargetSelect(target)}
                    role="option"
                    aria-selected={state.selectedIndex === index}
                    aria-label={displayLabel}
                    tabIndex={0}
                    sx={getTargetBoxSx(state.selectedIndex === index)}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {displayLabel}
                    </Typography>
                  </Box>
                );
              })}

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
                    <List ref={listboxRef} id="x-value-listbox" role="listbox" aria-label="Available X values" aria-hidden={!isDropdownOpen} sx={{ position: 'absolute', top: '100%', left: 0, right: 0, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 180, overflowY: 'auto', zIndex: 2, boxShadow: 2, mt: 0.5 }}>
                      {filteredOptions.map((option, idx) => (
                        <ListItem
                          key={`${option.value}-${idx}`}
                          id={`option-${idx}`}
                          role="option"
                          aria-selected={dropdownSelectedIndex === idx}
                          aria-label={option.label}
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
                            }
                          }}
                          sx={{ 'cursor': 'pointer', 'py': 1, 'px': 2, 'bgcolor': dropdownSelectedIndex === idx ? 'action.selected' : 'transparent', '&:hover': { bgcolor: 'action.hover' } }}
                        >
                          <ListItemText primary={option.label} />
                        </ListItem>
                      ))}
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
