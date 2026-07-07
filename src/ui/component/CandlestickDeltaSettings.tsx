import { Close } from '@mui/icons-material';
import { Box, IconButton, Typography } from '@mui/material';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import React, { useEffect, useRef } from 'react';

/**
 * The Ctrl+Shift+L reference picker for the candlestick delta layer: a listbox
 * of the moving-average / reference lines in the current subplot. The user
 * moves the highlight with Up/Down (handled by the CANDLESTICK_DELTA_SETTINGS
 * keybinding scope) and presses Enter to remember that line and activate the
 * comparison; Escape closes without changing anything.
 *
 * Keyboard handling lives in the scope keybindings (which drive the view
 * model), so this component only renders state and manages focus and
 * screen-reader announcements — mirroring the GoToExtrema modal.
 */
const CandlestickDeltaSettings: React.FC = () => {
  const viewModel = useViewModel('candlestickDelta');
  const state = useViewModelState('candlestickDelta');

  const modalRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  const visible = state.visible && state.references.length > 0;

  // Focus the modal on open so the scope keybindings have a non-input focus
  // target (hotkeys-js ignores editable elements) and screen readers land here.
  useEffect(() => {
    if (visible && modalRef.current) {
      modalRef.current.focus();
    }
  }, [visible]);

  // Keep the highlighted option focused and in view, and announce it.
  useEffect(() => {
    if (!visible) {
      return;
    }
    const item = selectedItemRef.current;
    if (item) {
      item.focus();
      item.scrollIntoView({ block: 'nearest' });
    }
    const reference = state.references[state.selectedIndex];
    if (liveRegionRef.current && reference) {
      liveRegionRef.current.textContent = `Selected: ${reference.label}`;
    }
  }, [visible, state.selectedIndex, state.references]);

  if (!visible) {
    return null;
  }

  const handleClose = (): void => {
    viewModel.cancel();
  };

  const handleSelect = (index: number): void => {
    viewModel.setSelectedIndex(index);
    viewModel.confirmSelection();
  };

  return (
    <>
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

      <Box
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="candlestick-delta-title"
        aria-describedby="candlestick-delta-description"
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
          minWidth: 320,
          maxWidth: 420,
          maxHeight: '80vh',
          outline: 'none',
        }}
      >
        <Box
          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}
        >
          <Typography
            id="candlestick-delta-title"
            variant="h6"
            component="h2"
            sx={{ m: 0, fontWeight: 600 }}
          >
            Compare to Reference Line
          </Typography>
          <IconButton onClick={handleClose} aria-label="Close reference picker" size="small">
            <Close />
          </IconButton>
        </Box>

        <Typography
          id="candlestick-delta-description"
          variant="body2"
          color="text.secondary"
          sx={{ mb: 2 }}
        >
          Choose a reference line to compare each candle against. Use the Up and
          Down arrows to move, then press Enter. Once chosen, press Alt L to
          turn the comparison on or off.
        </Typography>

        {/*
          Roving tabindex: real DOM focus is moved onto the highlighted option
          (see the selection effect above), so the container deliberately does
          NOT also carry aria-activedescendant — combining both focus patterns
          can double-announce on some screen reader/browser combinations.
        */}
        <Box
          ref={listContainerRef}
          role="listbox"
          aria-label="Reference lines"
          sx={{ maxHeight: 320, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}
        >
          {state.references.map((reference, index) => {
            const isSelected = index === state.selectedIndex;
            return (
              <Box
                key={reference.id}
                ref={isSelected ? selectedItemRef : null}
                id={`candlestick-delta-option-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-label={reference.label}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => handleSelect(index)}
                sx={{
                  'p': 1.5,
                  'mb': 0.5,
                  'border': isSelected ? 2 : 1,
                  'borderColor': isSelected ? 'primary.main' : 'divider',
                  'borderRadius': 1,
                  'cursor': 'pointer',
                  'bgcolor': isSelected ? 'action.selected' : 'transparent',
                  'outline': 'none',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {reference.label}
                </Typography>
              </Box>
            );
          })}
        </Box>

        <div
          ref={liveRegionRef}
          aria-live="assertive"
          aria-atomic="true"
          style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}
        />
      </Box>
    </>
  );
};

export default CandlestickDeltaSettings;
