import type { MarkItem } from '@state/viewModel/jumpToMarkViewModel';
import { Close } from '@mui/icons-material';
import { Box, IconButton, Typography } from '@mui/material';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import React, { useCallback, useEffect, useRef } from 'react';

/**
 * Helper function to generate styles for mark item boxes.
 */
function getMarkBoxSx(isSelected: boolean): object {
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

export const JumpToMark: React.FC = () => {
  const jumpToMarkViewModel = useViewModel('jumpToMark');
  const state = useViewModelState('jumpToMark');
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  // Focus the modal when it opens
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

  const announceToScreenReader = useCallback((message: string): void => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = message;
    }
  }, []);

  const getDisplayText = useCallback((mark: MarkItem): string => {
    return jumpToMarkViewModel.getMarkDisplayText(mark);
  }, [jumpToMarkViewModel]);

  const handleClose = useCallback((): void => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = '';
    }
    jumpToMarkViewModel.hide();
  }, [jumpToMarkViewModel]);

  const handleMarkSelect = useCallback((mark: MarkItem): void => {
    jumpToMarkViewModel.jumpToSlot(mark.slot);
  }, [jumpToMarkViewModel]);

  const handleListboxKeyDown = useCallback((event: React.KeyboardEvent): void => {
    // Handle number keys 0-9 for direct slot jumping
    if (event.key >= '0' && event.key <= '9') {
      event.preventDefault();
      event.stopPropagation();
      const slot = Number.parseInt(event.key, 10);
      jumpToMarkViewModel.jumpToSlot(slot);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();

      if (state.marks.length > 0 && state.selectedIndex < state.marks.length - 1) {
        jumpToMarkViewModel.moveDown();
        const newMark = state.marks[state.selectedIndex + 1];
        announceToScreenReader(`${newMark.slot}: ${getDisplayText(newMark)}`);
      } else {
        announceToScreenReader('At last mark');
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();

      if (state.selectedIndex > 0) {
        jumpToMarkViewModel.moveUp();
        const newMark = state.marks[state.selectedIndex - 1];
        announceToScreenReader(`${newMark.slot}: ${getDisplayText(newMark)}`);
      } else {
        announceToScreenReader('At first mark');
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();

      if (state.marks.length > 0 && state.selectedIndex < state.marks.length) {
        const selectedMark = state.marks[state.selectedIndex];
        handleMarkSelect(selectedMark);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      handleClose();
    }
  }, [state, jumpToMarkViewModel, announceToScreenReader, getDisplayText, handleMarkSelect, handleClose]);

  // Handle keyboard events on the modal itself (for when list is empty)
  const handleModalKeyDown = useCallback((event: React.KeyboardEvent): void => {
    // Handle number keys 0-9 for direct slot jumping
    if (event.key >= '0' && event.key <= '9') {
      event.preventDefault();
      event.stopPropagation();
      const slot = Number.parseInt(event.key, 10);
      jumpToMarkViewModel.jumpToSlot(slot);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      handleClose();
    }
  }, [jumpToMarkViewModel, handleClose]);

  return state.visible
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
            aria-labelledby="jump-to-mark-title"
            aria-describedby="jump-to-mark-description"
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
              maxWidth: 500,
              maxHeight: '80vh',
              outline: 'none',
            }}
          >
            {/* Header */}
            <Box id="jump-to-mark-title" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" component="h3" sx={{ m: 0, fontWeight: 600 }}>
                Jump to Mark
              </Typography>
              <IconButton onClick={handleClose} aria-label="Close dialog" size="small">
                <Close />
              </IconButton>
            </Box>

            {/* Description */}
            <Box id="jump-to-mark-description" sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ m: 0 }}>
                Navigate to current available marks in this plot, or use number keys
              </Typography>
            </Box>

            {/* Mark List or Empty State */}
            {state.marks.length > 0
              ? (
                  <Box
                    ref={listContainerRef}
                    role="listbox"
                    aria-label="Available marks"
                    onKeyDown={handleListboxKeyDown}
                    sx={{
                      maxHeight: 300,
                      overflowY: 'auto',
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                      p: 1,
                    }}
                  >
                    {state.marks.map((mark: MarkItem, index: number) => (
                      <Box
                        key={`mark-${mark.slot}`}
                        ref={index === state.selectedIndex ? selectedItemRef : null}
                        id={`mark-item-${index}`}
                        onClick={() => handleMarkSelect(mark)}
                        role="option"
                        aria-selected={state.selectedIndex === index}
                        aria-label={`Mark ${mark.slot}: ${getDisplayText(mark)}`}
                        tabIndex={0}
                        sx={getMarkBoxSx(state.selectedIndex === index)}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {mark.slot}
                          :
                          {' '}
                          {getDisplayText(mark)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )
              : (
                  <Box
                    sx={{
                      p: 3,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                      textAlign: 'center',
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      No marks exist, set one with Shift M + 1 (or any number) !
                    </Typography>
                  </Box>
                )}

            {/* Live region for screen reader announcements */}
            <div
              ref={liveRegionRef}
              id="jump-to-mark-live-region"
              aria-live="assertive"
              aria-atomic="true"
              style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}
            />
          </Box>
        </>
      )
    : null;
};
