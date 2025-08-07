import type { Keys, Scope } from '@type/event';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemButton, ListItemText, TextField } from '@mui/material';
import { SCOPED_KEYMAP } from '@service/keybinding';
import { useCommandExecutor } from '@state/hook/useCommandExecutor';
import hotkeys from 'hotkeys-js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  highlightedItem: {
    cursor: 'pointer',
    border: '2px solid #1976d2',
    margin: '6px',
  },
} as const;

const CommandPalette: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const { executeCommand, currentScope } = useCommandExecutor();

  // Ref for the list container to enable auto-scrolling
  const listRef = React.useRef<HTMLUListElement>(null);
  // Ref to track current announcement without causing re-renders
  const currentAnnouncementRef = useRef<string>('');
  // Ref to track the source of the current announcement
  const announcementSourceRef = useRef<'initial' | 'search' | 'navigation' | null>(null);

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
      cmd =>
        cmd.description.toLowerCase().includes(searchLower)
        || cmd.key.toLowerCase().includes(searchLower),
    );
  }, [availableCommands, search]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearch('');
    setHighlightedIndex(0);
    setAnnouncement('');
    currentAnnouncementRef.current = '';
    announcementSourceRef.current = null;

    // Restore focus to the plot when command palette closes
    setTimeout(() => {
      const plotElement = document.querySelector(
        '[role="image"]',
      ) as HTMLElement;
      if (plotElement) {
        plotElement.focus();
      }
    }, 0);
  }, []);

  const handleCommandSelect = useCallback(
    (commandKey: Keys) => {
      executeCommand(commandKey);
      handleClose();
    },
    [executeCommand, handleClose, currentScope],
  );

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
      const initialAnnouncement = 'Command palette opened. Use down and up arrows to navigate commands, Enter to select.';

      // Only set announcement if it's different from current
      if (currentAnnouncementRef.current !== initialAnnouncement) {
        setAnnouncement(initialAnnouncement);
        currentAnnouncementRef.current = initialAnnouncement;
        announcementSourceRef.current = 'initial';
      }
    };

    window.addEventListener('openCommandPalette', handleOpenCommandPalette);
    return () => {
      window.removeEventListener('openCommandPalette', handleOpenCommandPalette);
    };
  }, [currentScope]);

  useEffect(() => {
    if (!open) {
      return;
    }

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

        // Announce the selected command, but respect other announcement sources
        const selectedCommand = filteredCommands[highlightedIndex];
        const newAnnouncement = `Selected: ${selectedCommand.description} - ${selectedCommand.key}`;

        // Don't override search announcements
        if (announcementSourceRef.current === 'search') {
          return;
        }

        // For initial announcements, only skip if we're still on the first item
        // If user has navigated away from first item, allow navigation announcements
        if (announcementSourceRef.current === 'initial' && highlightedIndex === 0) {
          return;
        }

        // If we were on initial but now navigating, clear the initial source
        if (announcementSourceRef.current === 'initial' && highlightedIndex > 0) {
          announcementSourceRef.current = null;
        }

        // Only set announcement if it's different from current
        if (currentAnnouncementRef.current !== newAnnouncement) {
          setAnnouncement(newAnnouncement);
          currentAnnouncementRef.current = newAnnouncement;
          announcementSourceRef.current = 'navigation';
        }
      }
    }
  }, [highlightedIndex, filteredCommands, open]);

  useEffect(() => {
    currentAnnouncementRef.current = announcement;
  }, [announcement]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disablePortal
      role="dialog"
      slotProps={{
        paper: {
          sx: styles.dialogPaper,
        },
      }}
      aria-label="Command Palette"
    >
      <DialogTitle>Command Palette</DialogTitle>
      <DialogContent sx={styles.dialogContent}>
        <TextField
          autoFocus
          fullWidth
          placeholder="Type to search commands..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setHighlightedIndex(0);
            // Announce the number of filtered results
            const newSearch = e.target.value.trim();
            let newAnnouncement: string;
            if (newSearch) {
              const searchLower = newSearch.toLowerCase();
              const results = availableCommands.filter(
                cmd =>
                  cmd.description.toLowerCase().includes(searchLower)
                  || cmd.key.toLowerCase().includes(searchLower),
              );
              newAnnouncement = `Found ${results.length} matching commands`;
            } else {
              newAnnouncement = `Showing all ${availableCommands.length} commands`;
            }

            if (currentAnnouncementRef.current !== newAnnouncement) {
              setAnnouncement(newAnnouncement);
              currentAnnouncementRef.current = newAnnouncement;
              announcementSourceRef.current = 'search';
            }
          }}
          onKeyDown={(e) => {
            if (!filteredCommands.length)
              return;
            if (e.key === 'ArrowDown') {
              setHighlightedIndex(prev =>
                Math.min(prev + 1, filteredCommands.length - 1),
              );
              e.preventDefault();
            } else if (e.key === 'ArrowUp') {
              setHighlightedIndex(prev => Math.max(prev - 1, 0));
              e.preventDefault();
            } else if (e.key === 'Enter') {
              handleCommandSelect(
                filteredCommands[highlightedIndex].commandKey,
              );
              e.preventDefault();
            }
          }}
          sx={styles.searchField}
          slotProps={{
            input: {
              inputProps: {
                'aria-label':
                  'Search commands. Use down and up arrows to navigate, Enter to select.',
                'aria-describedby': 'command-list-instructions',
              },
            },
          }}
        />
        <div
          id="command-list-instructions"
          aria-live="polite"
          aria-atomic="true"
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
        <List
          sx={styles.commandList}
          ref={listRef}
          role="listbox"
          aria-label="Available commands"
          aria-activedescendant={
            filteredCommands.length > 0
              ? `command-${highlightedIndex}`
              : undefined
          }
        >
          {filteredCommands.length > 0
            ? (
                filteredCommands.map((cmd, idx) => (
                  <ListItemButton
                    key={cmd.commandKey}
                    id={`command-${idx}`}
                    onClick={() => handleCommandSelect(cmd.commandKey)}
                    selected={idx === highlightedIndex}
                    sx={
                      idx === highlightedIndex
                        ? styles.highlightedItem
                        : styles.commandListItem
                    }
                    role="option"
                    aria-selected={idx === highlightedIndex}
                  >
                    <ListItemText primary={cmd.description} secondary={cmd.key} />
                  </ListItemButton>
                ))
              )
            : (
                <ListItem>
                  <ListItemText primary="No commands found" />
                </ListItem>
              )}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary" variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CommandPalette;
