import type { ExtremaTarget } from '@type/extrema';
import type { XValue } from '@type/navigation';
import { Close, KeyboardArrowDown } from '@mui/icons-material';
import { Box, IconButton, List, ListItem, ListItemText, TextField, Typography } from '@mui/material';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import React, { useEffect, useMemo, useRef, useState } from 'react';

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
  const [filteredOptions, setFilteredOptions] = useState<XValue[]>([]);
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

  // Available X values from active trace if provided
  const availableXValues = useMemo(() => {
    return goToExtremaViewModel.getAvailableXValues();
  }, [goToExtremaViewModel]);

  // Keep filtered options in sync
  useEffect(() => {
    if (inputValue.trim() === '') {
      setFilteredOptions(availableXValues);
    } else {
      const q = inputValue.toLowerCase();
      setFilteredOptions(
        availableXValues.filter(v => String(v).toLowerCase().includes(q)),
      );
    }
    if (isDropdownOpen) {
      setDropdownSelectedIndex(prev => (prev < 0 ? 0 : Math.min(prev, Math.max(0, availableXValues.length - 1))));
    }
  }, [inputValue, availableXValues, isDropdownOpen]);

  // Compute active option text for announcement via aria-valuetext
  const activeOptionText = dropdownSelectedIndex >= 0 && filteredOptions[dropdownSelectedIndex] !== undefined
    ? String(filteredOptions[dropdownSelectedIndex])
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
        // Announce the newly selected option
        const newOption = state.targets[state.selectedIndex + 1];
        announceToScreenReader(`Selected: ${newOption.label}`);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();

      if (state.selectedIndex === 0) {
        announceToScreenReader('At first extrema option');
      } else {
        goToExtremaViewModel.moveUp();
        // Announce the newly selected option
        const newOption = state.targets[state.selectedIndex - 1];
        announceToScreenReader(`Selected: ${newOption.label}`);
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
        handleOptionSelect(filteredOptions[dropdownSelectedIndex]);
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
          announceToScreenReader(`Selected: ${filteredOptions[dropdownSelectedIndex + 1]}`);
        }
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      // If on first search result, go back to main options
      if (dropdownSelectedIndex === 0) {
        setIsDropdownOpen(false);
        setDropdownSelectedIndex(-1);
        // Get the last selected extrema option's label for announcement
        const lastSelectedOption = state.targets[state.selectedIndex];
        announceToScreenReader(`Returning to extrema options: ${lastSelectedOption.label}`);
        // Focus back on the selected option
        if (selectedItemRef.current) {
          selectedItemRef.current.focus();
        }
      } else {
        setDropdownSelectedIndex(i => Math.max(0, i - 1));
        // Announce the newly selected search result
        if (filteredOptions[dropdownSelectedIndex - 1]) {
          announceToScreenReader(`Selected: ${filteredOptions[dropdownSelectedIndex - 1]}`);
        }
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
                // Format display based on target type using structured display fields when available
                const isIntersection = target.type === 'intersection';
                let displayLabel: string;

                if (isIntersection && target.display) {
                  // Use structured display fields for intersections
                  displayLabel = `Intersection with ${target.display.otherLines} at ${target.display.coords}`;
                } else if (isIntersection) {
                  // Fallback for intersection without display fields
                  displayLabel = target.label;
                } else {
                  // For min/max, show: "Max point Value: 8.00 at X"
                  const labelParts = target.label.split(' at ');
                  displayLabel = `${labelParts[0]} Value: ${target.value.toFixed(2)} at ${labelParts[1]}`;
                }

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
              {availableXValues.length > 0 && (
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
                    placeholder={`Type to search ${availableXValues.length} values`}
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
                      {filteredOptions.map((value, idx) => (
                        <ListItem
                          key={`${value}-${idx}`}
                          id={`option-${idx}`}
                          role="option"
                          aria-selected={dropdownSelectedIndex === idx}
                          aria-label={String(value)}
                          tabIndex={0}
                          onClick={() => handleOptionSelect(value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              handleOptionSelect(value);
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
                          <ListItemText primary={String(value)} />
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
