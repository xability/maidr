import type { Keys } from '@type/event';
import { Box, Dialog, DialogContent, List, ListItemButton, ListItemText, TextField, Typography } from '@mui/material';
import { useCommandExecutor } from '@state/hook/useCommandExecutor';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface CommandItem {
  key: string;
  description: string;
  commandKey: Keys;
}

const CommandPalette: React.FC = () => {
  const commandPaletteViewModel = useViewModel('commandPalette');
  const state = useViewModelState('commandPalette');
  const { executeCommand } = useCommandExecutor();
  const [announcement] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!state.search.trim()) {
      return state.commands;
    }
    const searchLower = state.search.toLowerCase();
    return state.commands.filter((command: CommandItem) =>
      command.description.toLowerCase().includes(searchLower)
      || command.key.toLowerCase().includes(searchLower),
    );
  }, [state.commands, state.search]);

  // Ensure search input gets focus when dialog opens or when returning to search
  useEffect(() => {
    if (state.visible && searchInputRef.current) {
      // Use setTimeout to ensure the dialog is fully rendered
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 100);
    }
  }, [state.visible]);

  // Focus search input when returning to search (selectedIndex becomes -1)
  useEffect(() => {
    // Only handle focus when dialog first opens, not when returning to search
    if (state.visible && searchInputRef.current && state.selectedIndex === -1) {
      // Don't auto-focus when returning to search to avoid dialog close issues
    }
  }, [state.selectedIndex, state.visible]);

  // Auto-scroll to selected item and focus it
  useEffect(() => {
    if (listRef.current && state.selectedIndex >= 0) {
      const listElement = listRef.current;
      const selectedElement = listElement.children[state.selectedIndex] as HTMLElement;

      if (selectedElement) {
        // Focus the selected element for screen reader
        selectedElement.focus();

        const listRect = listElement.getBoundingClientRect();
        const elementRect = selectedElement.getBoundingClientRect();

        // Check if element is outside the visible area
        if (elementRect.top < listRect.top || elementRect.bottom > listRect.bottom) {
          selectedElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
        }
      }
    }
  }, [state.selectedIndex]);

  const handleClose = useCallback(() => {
    commandPaletteViewModel.hide();
  }, [commandPaletteViewModel]);

  const handleCommandSelect = useCallback((commandKey: Keys) => {
    // Execute the command first, then close
    executeCommand(commandKey);
    handleClose();
  }, [executeCommand, handleClose]);

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    commandPaletteViewModel.updateSearch(event.target.value);
  }, [commandPaletteViewModel]);

  if (!state.visible) {
    return null;
  }

  return (
    <Dialog
      open={state.visible}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      disablePortal
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-palette-title"
      aria-describedby="command-palette-description"
      sx={{
        '& .MuiDialog-paper': {
          maxHeight: '80vh',
        },
      }}
    >
      <Box component="h2" id="command-palette-title" sx={{ p: 2, m: 0 }}>
        <Box component="span" sx={{ fontSize: '1.25rem', fontWeight: 600 }}>
          Command Palette
        </Box>
      </Box>

      <DialogContent dividers sx={{ p: 2, overflow: 'hidden' }}>
        <Box id="command-palette-description" sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ m: 0 }}>
            Type to search commands, use arrow keys to navigate the list, and press Enter to execute a command
          </Typography>
        </Box>

        <TextField
          ref={searchInputRef}
          fullWidth
          placeholder="Search commands..."
          value={state.search}
          onChange={handleSearchChange}
          sx={{ mb: 2 }}
          autoFocus
          inputProps={{
            'role': 'combobox',
            'aria-autocomplete': 'list',
            'aria-haspopup': 'listbox',
            'aria-controls': 'command-list',
            'aria-expanded': true,
            'aria-activedescendant': state.selectedIndex >= 0 ? `command-${state.selectedIndex}` : undefined,
            'aria-label': 'Search commands',
            'aria-describedby': 'command-palette-description',
            'onKeyDown': (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (filteredCommands.length > 0 && state.selectedIndex >= 0) {
                  const selectedCommand = filteredCommands[state.selectedIndex];
                  if (selectedCommand) {
                    handleCommandSelect(selectedCommand.commandKey as Keys);
                  }
                }
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                commandPaletteViewModel.moveDown();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                // If we're on the first option (index 0), go back to search
                if (state.selectedIndex === 0) {
                  commandPaletteViewModel.moveToSearch();
                } else {
                  commandPaletteViewModel.moveUp();
                }
              }
            },
          }}
        />

        <List
          ref={listRef}
          id="command-list"
          role="listbox"
          aria-label="Available commands"
          sx={{ flex: 1, overflow: 'auto', maxHeight: '60vh' }}
        >
          {filteredCommands.map((command: CommandItem, index: number) => (
            <ListItemButton
              key={command.commandKey}
              id={`command-${index}`}
              role="option"
              aria-selected={index === state.selectedIndex}
              aria-label={`${command.description} (${command.key})`}
              selected={index === state.selectedIndex}
              tabIndex={index === state.selectedIndex ? 0 : -1}
              onClick={() => handleCommandSelect(command.commandKey as Keys)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCommandSelect(command.commandKey as Keys);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (index === 0) {
                    // If we're on the first option, go back to search
                    commandPaletteViewModel.moveToSearch();
                    // Don't manually focus - let the dialog handle it
                  } else {
                    commandPaletteViewModel.moveUp();
                  }
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  e.stopPropagation();
                  commandPaletteViewModel.moveDown();
                }
              }}
              sx={{
                'cursor': 'pointer',
                '&:hover': {
                  bgcolor: 'action.hover',
                },
                '&.Mui-selected': {
                  bgcolor: 'action.selected',
                },
              }}
            >
              <ListItemText
                primary={command.description}
                secondary={`${command.key}`}
              />
            </ListItemButton>
          ))}
        </List>

        {announcement && (
          <div
            aria-live="assertive"
            style={{
              position: 'absolute',
              left: '-10000px',
              width: '1px',
              height: '1px',
              overflow: 'hidden',
            }}
          >
            {announcement}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CommandPalette;
