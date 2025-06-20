import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, TextField, List, ListItem, ListItemText, Typography, Button, DialogActions } from '@mui/material';
import { useCommandExecutor } from '@state/hook/useCommandExecutor';
import { SCOPED_KEYMAP } from '@service/keybinding';
import { Scope, Keys } from '@type/event';
import hotkeys from 'hotkeys-js';
import { Platform } from '@util/platform';

interface CommandItem {
  key: string;
  description: string;
  commandKey: Keys;
}

const CommandPalette: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { executeCommand, currentScope } = useCommandExecutor();

  // Get all available commands for current scope
  const availableCommands = useMemo(() => {
    const scopeKeymap = SCOPED_KEYMAP[currentScope as Scope];
    if (!scopeKeymap) return [];

    return Object.entries(scopeKeymap)
      .filter(([commandKey]) => !commandKey.startsWith('ALLOW_')) // Filter out ALLOW_ commands
      .map(([commandKey, key]) => ({
        key,
        description: commandKey.replace(/_/g, ' ').toLowerCase(),
        commandKey: commandKey as Keys,
      }));
  }, [currentScope]);

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!search.trim()) return []; // Return empty array if search is empty or only whitespace
    const searchLower = search.toLowerCase();
    return availableCommands.filter(
      cmd => cmd.description.includes(searchLower) || cmd.key.includes(searchLower)
    );
  }, [availableCommands, search]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearch('');
  }, []);

  const handleCommandSelect = useCallback((commandKey: Keys) => {
    console.log('Executing command:', commandKey, 'in scope:', currentScope);
    executeCommand(commandKey);
    handleClose();
  }, [executeCommand, handleClose, currentScope]);

  // Register keyboard shortcuts
  useEffect(() => {
    // Open command palette
    hotkeys(`${Platform.ctrl}+k`, (event) => {
      event.preventDefault();
      setOpen(true);
    });

    // Close command palette
    hotkeys('esc', { scope: 'command-palette' }, () => {
      handleClose();
    });

    return () => {
      hotkeys.unbind(`${Platform.ctrl}+k`);
      hotkeys.unbind('esc', 'command-palette');
    };
  }, [handleClose]);

  // Log available commands when scope changes
  useEffect(() => {
    console.log('Current scope:', currentScope);
    console.log('Available commands:', availableCommands);
  }, [currentScope, availableCommands]);

  useEffect(() => {
    const handleOpenCommandPalette = () => {
      setOpen(true);
    };

    window.addEventListener('openCommandPalette', handleOpenCommandPalette);
    return () => {
      window.removeEventListener('openCommandPalette', handleOpenCommandPalette);
    };
  }, []);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disablePortal
      PaperProps={{
        sx: {
          position: 'absolute',
          top: '20%',
          margin: 0,
        },
      }}
    >
      <DialogTitle>
        Command Palette
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          placeholder="Type to search commands..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 2 }}
        />
        {search.trim() && (
          <List>
            {filteredCommands.length > 0 ? (
              filteredCommands.map((cmd) => (
                <ListItem
                  key={cmd.commandKey}
                  onClick={() => handleCommandSelect(cmd.commandKey)}
                  sx={{ cursor: 'pointer' }}
                >
                  <ListItemText
                    primary={cmd.description}
                    secondary={cmd.key}
                  />
                </ListItem>
              ))
            ) : (
              <ListItem>
                <ListItemText primary="No commands found" />
              </ListItem>
            )}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary" variant='contained'>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CommandPalette;
