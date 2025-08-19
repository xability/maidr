import type { ExtremaTarget } from '@service/goToExtrema';
import { Close } from '@mui/icons-material';
import { Box, IconButton, Typography } from '@mui/material';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import React, { useEffect, useRef } from 'react';

export const GoToExtrema: React.FC = () => {
  const goToExtremaViewModel = useViewModel('goToExtrema');
  const state = useViewModelState('goToExtrema');
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

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

  const handleTargetSelect = (target: ExtremaTarget): void => {
    const activeTrace = goToExtremaViewModel.activeContext?.active;
    if (activeTrace && 'navigateToExtrema' in activeTrace) {
      (activeTrace as any).navigateToExtrema(target);
    }
    goToExtremaViewModel.hide();
  };

  const handleClose = (): void => {
    goToExtremaViewModel.hide();
  };

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    // Prevent focus from escaping the modal
    if (event.key === 'Tab') {
      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [tabindex]:not([tabindex="-1"])',
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
          onKeyDown={handleKeyDown}
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
            minWidth: 300,
            maxHeight: '80vh',
            outline: 'none',
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
              Navigate to statistical extremes within the current candlestick
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
                  'border': 1,
                  'borderColor': state.selectedIndex === index ? 'primary.main' : 'divider',
                  'borderRadius': 1,
                  'mb': 1,
                  'cursor': 'pointer',
                  'bgcolor': state.selectedIndex === index ? 'action.selected' : 'background.paper',
                  'transition': 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: state.selectedIndex === index ? 'action.selected' : 'action.hover',
                  },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                  {target.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Value:
                  {' '}
                  {target.value.toFixed(2)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )
    : null;
};
