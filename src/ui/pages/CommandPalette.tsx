import type { Keys, Scope } from '@type/event';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemButton, ListItemText, TextField } from '@mui/material';
import { SCOPED_KEYMAP } from '@service/keybinding';
import { useCommandExecutor } from '@state/hook/useCommandExecutor';
import hotkeys from 'hotkeys-js';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, txt =>
    txt.charAt(0).toUpperCase() + txt.slice(1));
}

const styles = {
  dialogPaper: {
    position: 'absolute',
    top: '20%',
    margin: 0,
    maxHeight: '60vh',
  },
  dialogContent: {
    p: 0,
  },
  searchField: {
    p: 1,
  },
  commandList: {
    maxHeight: '30vh',
    overflow: 'auto',
  },
  commandListItem: {
    cursor: 'pointer',
  },
} as const;

const CommandPalette: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const { executeCommand, currentScope } = useCommandExecutor();

  // Ref for the list container to enable auto-scrolling
  const listRef = React.useRef<HTMLUListElement>(null);

  const availableCommands = useMemo(() => {
    const scopeKeymap = SCOPED_KEYMAP[currentScope as Scope];
    if (!scopeKeymap)
      return [];

    return Object.entries(scopeKeymap)
      .filter(([commandKey]) => !commandKey.startsWith('ALLOW_'))
      .map(([commandKey, key]) => ({
        key,
        description: toTitleCase(commandKey.replace(/_/g, ' ').toLowerCase()),
        commandKey: commandKey as Keys,
      }));
  }, [currentScope]);

  const filteredCommands = useMemo(() => {
    if (!search.trim())
      return availableCommands;
    const searchLower = search.toLowerCase();
    return availableCommands.filter(
      cmd => cmd.description.toLowerCase().includes(searchLower) || cmd.key.toLowerCase().includes(searchLower),
    );
  }, [availableCommands, search]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearch('');
    setHighlightedIndex(0);

    // Restore focus to the plot when command palette closes
    setTimeout(() => {
      const plotElement = document.querySelector('[role="image"]') as HTMLElement;
      if (plotElement) {
        plotElement.focus();
      }
    }, 0);
  }, []);

  const handleCommandSelect = useCallback((commandKey: Keys) => {
    executeCommand(commandKey);
    handleClose();
  }, [executeCommand, handleClose, currentScope]);

  useEffect(() => {
    hotkeys('esc', { scope: 'command-palette' }, () => {
      handleClose();
    });

    return () => {
      hotkeys.unbind('esc', 'command-palette');
    };
  }, [handleClose]);

  useEffect(() => {
    const handleOpenCommandPalette = (): void => {
      setOpen(true);
    };

    window.addEventListener('openCommandPalette', handleOpenCommandPalette);
    return () => {
      window.removeEventListener('openCommandPalette', handleOpenCommandPalette);
    };
  }, [currentScope]);

  // Auto-scroll to highlighted item
  useEffect(() => {
    if (listRef.current && filteredCommands.length > 0) {
      const listElement = listRef.current;
      const highlightedElement = listElement.children[highlightedIndex] as HTMLElement;

      if (highlightedElement) {
        const listRect = listElement.getBoundingClientRect();
        const elementRect = highlightedElement.getBoundingClientRect();

        // Check if element is outside the visible area
        if (elementRect.top < listRect.top || elementRect.bottom > listRect.bottom) {
          highlightedElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
        }
      }
    }
  }, [highlightedIndex, filteredCommands.length]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disablePortal
      slotProps={{
        paper: {
          sx: styles.dialogPaper,
        },
      }}
      aria-label="Command Palette"
    >
      <DialogTitle>
        Command Palette
      </DialogTitle>
      <DialogContent sx={styles.dialogContent}>
        <TextField
          autoFocus
          fullWidth
          placeholder="Type to search commands..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setHighlightedIndex(0);
          }}
          onKeyDown={(e) => {
            if (!filteredCommands.length)
              return;
            if (e.key === 'ArrowDown') {
              setHighlightedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
              e.preventDefault();
            } else if (e.key === 'ArrowUp') {
              setHighlightedIndex(prev => Math.max(prev - 1, 0));
              e.preventDefault();
            } else if (e.key === 'Enter') {
              handleCommandSelect(filteredCommands[highlightedIndex].commandKey);
              e.preventDefault();
            }
          }}
          sx={styles.searchField}
          aria-label="Search commands"
        />
        <List sx={styles.commandList} ref={listRef}>
          {filteredCommands.length > 0
            ? (
                filteredCommands.map((cmd, idx) => (
                  <ListItemButton
                    key={cmd.commandKey}
                    onClick={() => handleCommandSelect(cmd.commandKey)}
                    selected={idx === highlightedIndex}
                    sx={styles.commandListItem}
                    aria-label={`${cmd.description} - ${cmd.key}`}
                  >
                    <ListItemText
                      primary={cmd.description}
                      secondary={cmd.key}
                    />
                  </ListItemButton>
                ))
              )
            : (
                <ListItem>
                  <ListItemText primary="No commands found" aria-label="No commands found" />
                </ListItem>
              )}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary" variant="contained" aria-label="Close Command Palette">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CommandPalette;
