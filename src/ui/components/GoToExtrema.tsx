import type { ExtremaTarget } from '@type/extrema';
import type { XValue } from '@type/navigation';
import { Close, KeyboardArrowDown } from '@mui/icons-material';
import { Box, IconButton, List, ListItem, ListItemText, TextField, Typography } from '@mui/material';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const GoToExtrema: React.FC = () => {
  const goToExtremaViewModel = useViewModel('goToExtrema');
  const goToSpecificValueViewModel = useViewModel('goToSpecificValue');
  const state = useViewModelState('goToExtrema');
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Go to Specific Value state
  const [inputValue, setInputValue] = useState('');
  const [filteredOptions, setFilteredOptions] = useState<Array<{ value: XValue; group?: string; description: string }>>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const availableXValues = useMemo(() => {
    const values = goToSpecificValueViewModel?.getXValuesWithGroups() || [];
    return values;
  }, [goToSpecificValueViewModel]);

  // Get the X-axis label for the input field
  const xAxisLabel = useMemo(() => {
    return goToExtremaViewModel?.getXAxisLabel() || 'X value';
  }, [goToExtremaViewModel]);

  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.focus();
    }
  }, []);

  // Auto-scroll and focus management when selection changes
  useEffect(() => {
    if (selectedItemRef.current && listContainerRef.current) {
      const listContainer = listContainerRef.current;
      const selectedItem = selectedItemRef.current;

      // Move focus to the selected item so screen reader announces it
      selectedItem.focus();

      // Calculate if the selected item is outside the visible area
      const containerRect = listContainer.getBoundingClientRect();
      const itemRect = selectedItem.getBoundingClientRect();

      // Check if item is below the visible area
      if (itemRect.bottom > containerRect.bottom) {
        selectedItem.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
      } else if (itemRect.top < containerRect.top) {
        // Check if item is above the visible area
        selectedItem.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
      }
    }
  }, [state.selectedIndex]);

  // Filter options when input changes
  useEffect(() => {
    if (inputValue.trim() === '') {
      setFilteredOptions(availableXValues);
    } else {
      const filtered = availableXValues.filter(option =>
        String(option.value).toLowerCase().includes(inputValue.toLowerCase())
        || (option.group && option.group.toLowerCase().includes(inputValue.toLowerCase()))
        || option.description.toLowerCase().includes(inputValue.toLowerCase()),
      );
      setFilteredOptions(filtered);
    }
  }, [inputValue, availableXValues]);

  // Announce filtered results for accessibility
  useEffect(() => {
    if (isDropdownOpen && filteredOptions.length > 0) {
      const hasGroups = filteredOptions.some(option => option.group);
      let announcement = `${filteredOptions.length} option${filteredOptions.length === 1 ? '' : 's'} available`;

      if (hasGroups) {
        const uniqueGroups = new Set(filteredOptions.map(option => option.group).filter(Boolean));
        if (uniqueGroups.size > 0) {
          announcement += ` across ${uniqueGroups.size} group${uniqueGroups.size === 1 ? '' : 's'}`;
        }
      }

      // Use a timeout to ensure the announcement happens after the dropdown is rendered
      setTimeout(() => {
        const liveRegion = document.getElementById('filtered-results-announcement');
        if (liveRegion) {
          liveRegion.textContent = announcement;
        }
      }, 100);
    }
  }, [filteredOptions.length, isDropdownOpen]);

  // Handle clicks outside the dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus the input when dropdown opens for better accessibility
  useEffect(() => {
    if (isDropdownOpen && inputRef.current) {
      const input = inputRef.current.querySelector('input');
      if (input) {
        // Small delay to ensure the dropdown is fully rendered
        setTimeout(() => {
          input.focus();
        }, 100);
      }
    }
  }, [isDropdownOpen]);

  // Ensure selected option is visible in dropdown
  const scrollSelectedIntoView = useCallback((index: number) => {
    if (listboxRef.current && index >= 0) {
      const selectedOption = listboxRef.current.querySelector(`#option-${index}`);
      if (selectedOption) {
        selectedOption.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, []);

  // Scroll selected option into view when selection changes
  useEffect(() => {
    if (selectedIndex >= 0) {
      scrollSelectedIntoView(selectedIndex);
    }
  }, [selectedIndex, scrollSelectedIntoView]);

  const handleTargetSelect = (target: ExtremaTarget): void => {
    const activeTrace = goToExtremaViewModel.activeContext?.active;
    if (activeTrace && goToExtremaViewModel.isExtremaNavigable(activeTrace)) {
      activeTrace.navigateToExtrema(target);
    }
    goToExtremaViewModel.hide();
  };

  const handleSpecificValueSelect = (value: XValue): void => {
    if (goToSpecificValueViewModel) {
      goToSpecificValueViewModel.navigateToXValue(value);
      goToExtremaViewModel.hide();
    }
  };

  const handleClose = (): void => {
    goToExtremaViewModel.hide();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter' && selectedIndex >= 0) {
      event.preventDefault();
      const chosen = String(filteredOptions[selectedIndex].value);
      setInputValue(chosen);
      setIsDropdownOpen(false);
      setSelectedIndex(-1);
      handleSpecificValueSelect(chosen);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsDropdownOpen(false);
      setSelectedIndex(-1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      let newIndex: number;
      if (selectedIndex === -1) {
        // First arrow down - select first option
        newIndex = 0;
      } else {
        newIndex = Math.min(selectedIndex + 1, filteredOptions.length - 1);
      }
      setSelectedIndex(newIndex);
      // Focus the selected option after state update
      setTimeout(() => {
        const optionElement = listboxRef.current?.querySelector(`#option-${newIndex}`);
        if (optionElement) {
          (optionElement as HTMLElement).focus();
        }
      }, 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      let newIndex: number;
      if (selectedIndex === -1) {
        // First arrow up - select last option
        newIndex = filteredOptions.length - 1;
      } else {
        newIndex = Math.max(selectedIndex - 1, 0);
      }
      setSelectedIndex(newIndex);
      // Focus the selected option after state update
      setTimeout(() => {
        const optionElement = listboxRef.current?.querySelector(`#option-${newIndex}`);
        if (optionElement) {
          (optionElement as HTMLElement).focus();
        }
      }, 0);
    }
  };

  // Conditional rendering in JSX, not early return (following codebase pattern)
  return state.visible && state.targets.length > 0
    ? (
        <Box
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="go-to-extrema-title"
          aria-describedby="go-to-extrema-description"
          tabIndex={0}
          onKeyDown={(event) => {
            // Handle Tab navigation within the modal
            if (event.key === 'Tab') {
              const focusableElements = modalRef.current?.querySelectorAll(
                'button, [tabindex]:not([tabindex="-1"]), input, [role="option"]',
              );
              if (focusableElements && focusableElements.length > 0) {
                const firstElement = focusableElements[0] as HTMLElement;
                const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

                if (event.shiftKey && document.activeElement === firstElement) {
                  event.preventDefault();
                  lastElement.focus();
                } else if (!event.shiftKey && document.activeElement === lastElement) {
                  event.preventDefault();
                  firstElement.focus();
                }
              }
            }
          }}
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
            zIndex: 1000,
            // Responsive sizing that works well in iframes
            minWidth: { xs: '90vw', sm: '400px', md: '500px' },
            maxWidth: { xs: '95vw', sm: '80vw', md: '60vw' },
            width: 'fit-content',
            maxHeight: { xs: '90vh', sm: '85vh' },
            height: 'fit-content',
            outline: 'none',
            overflow: 'visible', // Allow dropdown to extend beyond modal
            // Ensure modal works well in iframes
            contain: 'layout style',
          }}
        >
          <Box
            id="go-to-extrema-title"
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Typography variant="h6" component="h3" sx={{ m: 0, fontWeight: 600 }}>
              Go To Extrema
            </Typography>
            <IconButton
              onClick={handleClose}
              aria-label="Close dialog"
              size="small"
            >
              <Close />
            </IconButton>
          </Box>

          <Box id="go-to-extrema-description" sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ m: 0 }}>
              {state.description || 'Navigate to statistical extremes'}
            </Typography>
          </Box>

          <Box
            ref={listContainerRef}
            role="listbox"
            aria-label="Extrema targets"
            aria-activedescendant={`extrema-target-${state.selectedIndex}`}
            sx={{
              maxHeight: 300,
              overflowY: 'auto',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              p: 1,
              mb: 2,
            }}
          >
            {state.targets.map((target: ExtremaTarget, index: number) => (
              <Box
                key={`${target.segment}-${target.type}-${target.pointIndex}`}
                ref={index === state.selectedIndex ? selectedItemRef : null}
                id={`extrema-target-${index}`}
                onClick={() => handleTargetSelect(target)}
                role="option"
                aria-selected={state.selectedIndex === index}
                aria-label={`${target.label}, Value: ${target.value.toFixed(2)}`}
                tabIndex={0}
                sx={{
                  'p': 1.5,
                  'cursor': 'pointer',
                  'borderRadius': 1,
                  'mb': 0.5,
                  'border': state.selectedIndex === index ? 2 : 1,
                  'borderColor': state.selectedIndex === index ? 'primary.main' : 'divider',
                  'bgcolor': state.selectedIndex === index ? 'action.selected' : 'transparent',
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                  '&:focus': {
                    outline: 'none',
                    borderColor: 'primary.main',
                    bgcolor: 'action.selected',
                  },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  {target.label}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Value:
                  {' '}
                  {target.value.toFixed(2)}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Go to Specific Value Section */}
          <Box sx={{ borderTop: 1, borderColor: 'divider', mt: 2, pt: 2, overflow: 'visible', position: 'relative' }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Go to Specific
              {' '}
              {xAxisLabel}
            </Typography>

            {availableXValues.length > 0
              ? (
                  <Box sx={{ position: 'relative' }}>
                    <TextField
                      ref={inputRef}
                      label={xAxisLabel}
                      placeholder={`Type to search ${xAxisLabel.toLowerCase()} values`}
                      fullWidth
                      variant="outlined"
                      size="small"
                      value={inputValue}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        setInputValue(newValue);
                        setIsDropdownOpen(true);
                        setSelectedIndex(-1);
                      }}
                      onFocus={() => {
                        setIsDropdownOpen(true);
                        setSelectedIndex(-1);
                      }}
                      onKeyDown={handleInputKeyDown}
                      slotProps={{
                        input: {
                          'aria-autocomplete': 'list',
                          'aria-haspopup': 'listbox',
                          'aria-controls': 'x-value-listbox',
                          'aria-expanded': isDropdownOpen,
                          'aria-activedescendant': selectedIndex >= 0 ? `option-${selectedIndex}` : undefined,
                          'role': 'combobox',
                          'aria-label': 'Search and select X value',
                          'endAdornment': (
                            <IconButton
                              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                              aria-label={isDropdownOpen ? 'Close dropdown' : 'Open dropdown'}
                              size="small"
                            >
                              <KeyboardArrowDown />
                            </IconButton>
                          ),
                        },
                      }}
                    />

                    {/* Accessibility announcement for filtered results */}
                    <div
                      id="filtered-results-announcement"
                      aria-live="polite"
                      aria-atomic="true"
                      style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}
                    />

                    {isDropdownOpen && filteredOptions.length > 0 && (
                      <List
                        ref={listboxRef}
                        id="x-value-listbox"
                        role="listbox"
                        aria-label="Available X values"
                        sx={{
                          position: 'absolute',
                          bottom: '100%', // Position above the input
                          left: 0,
                          right: 0,
                          bgcolor: 'background.paper',
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1,
                          maxHeight: 200,
                          overflowY: 'auto',
                          zIndex: 9999,
                          boxShadow: 2,
                          marginBottom: 1,
                        }}
                      >
                        {filteredOptions.map((option, index) => (
                          <ListItem
                            key={index}
                            disablePadding
                            id={`option-${index}`}
                            role="option"
                            aria-selected={index === selectedIndex}
                            aria-posinset={index + 1}
                            aria-setsize={filteredOptions.length}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                const chosen = String(option.value);
                                setInputValue(chosen);
                                setIsDropdownOpen(false);
                                setSelectedIndex(-1);
                                handleSpecificValueSelect(option.value);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsDropdownOpen(false);
                                setSelectedIndex(-1);
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                e.stopPropagation();
                                const newIndex = Math.min(index + 1, filteredOptions.length - 1);
                                setSelectedIndex(newIndex);
                                setTimeout(() => {
                                  const nextOption = listboxRef.current?.querySelector(`#option-${newIndex}`);
                                  if (nextOption) {
                                    (nextOption as HTMLElement).focus();
                                  }
                                }, 0);
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                e.stopPropagation();
                                const newIndex = Math.max(index - 1, 0);
                                setSelectedIndex(newIndex);
                                setTimeout(() => {
                                  const prevOption = listboxRef.current?.querySelector(`#option-${newIndex}`);
                                  if (prevOption) {
                                    (prevOption as HTMLElement).focus();
                                  }
                                }, 0);
                              }
                            }}
                          >
                            <ListItemText
                              primary={(
                                <span style={{ display: 'flex', alignItems: 'center' }}>
                                  <Typography variant="body2" component="span">
                                    {option.value}
                                  </Typography>
                                  {option.group && (
                                    <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                                      (
                                      {option.group}
                                      )
                                    </Typography>
                                  )}
                                </span>
                              )}
                              onClick={() => {
                                const chosen = String(option.value);
                                setInputValue(chosen);
                                setIsDropdownOpen(false);
                                setSelectedIndex(-1);
                                handleSpecificValueSelect(option.value);
                              }}
                              sx={{
                                'cursor': 'pointer',
                                '&:hover': {
                                  bgcolor: 'action.hover',
                                },
                              }}
                            />
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </Box>
                )
              : (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                    No specific values available for this plot type.
                  </Typography>
                )}
          </Box>
        </Box>
      )
    : null;
};
