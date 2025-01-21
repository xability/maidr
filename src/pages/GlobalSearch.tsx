import {
  Box,
  Dialog,
  DialogContent,
  IconButton,
  List,
  ListItem,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import hotkeys from 'hotkeys-js';
import React, {useEffect} from 'react';
import {useState} from 'react';

type SearchItem = {
  key: string;
  displayText: string;
  shortcut?: string;
};
function createSearchData(
  key: string,
  displayText: string,
  shortcut: string
): SearchItem {
  return {key, displayText, shortcut};
}
const options: SearchItem[] = [
  createSearchData('HELP_MENU', 'Keyboard Shortcuts', 'command+/'),
  createSearchData('TOGGLE_BRAILLE', 'Toggle Braille Mode', 'b'),
  createSearchData('TOGGLE_TEXT', 'Toggle Text Mode', 't'),
  createSearchData('TOGGLE_AUDIO', 'Toggle Sonification Mode', 's'),
  createSearchData('review-mode', 'Toggle Review Mode', 'r'),
  createSearchData('repeat-sound', 'Repeat Current Sound', 'Space'),
  createSearchData('MOVE_LEFT', 'Move Left', 'Left Arrow'),
  createSearchData('MOVE_RIGHT', 'Move Right', 'Right Arrow'),
  createSearchData('extreme-left', 'Go to very left', 'Cmd + Left Arrow'),
  createSearchData('extreme-right', 'Go to very right', 'Cmd + Right Arrow'),
  createSearchData('ai-chat', 'Toggle AI Chat', 'Option + Shift + /'),
];
interface GlobalSearchProps {
  executeShortcut: (shortcut: string) => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({
  executeShortcut,
}) => {
  const [open, setOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredOptions, setFilteredOptions] = useState(options);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const handleOpen = () => {
    setOpen(true);
    setSelectedIndex(0);
  };

  const handleClose = () => {
    setOpen(false);
    setSearchTerm('');
    setFilteredOptions(options);
    setSelectedIndex(-1);
  };

  const handleSearchChange = (event: {target: {value: string}}) => {
    const query = event.target.value.toLowerCase();
    setSearchTerm(query);
    setFilteredOptions(
      options.filter(option => option.displayText.toLowerCase().includes(query))
    );
    setSelectedIndex(0);
  };

  const handleKeyDown = (event: {preventDefault(): unknown; key: string}) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex(prevIndex =>
        prevIndex < filteredOptions.length - 1 ? prevIndex + 1 : prevIndex
      );
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex(prevIndex =>
        prevIndex > 0 ? prevIndex - 1 : prevIndex
      );
    } else if (event.key === 'Enter' && selectedIndex >= 0) {
      // Select the highlighted item
      console.log(`Selected: ${filteredOptions[selectedIndex].shortcut}`);
      if (filteredOptions[selectedIndex].shortcut) {
        executeShortcut(filteredOptions[selectedIndex].key);
      }
      handleClose();
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (event: {
      ctrlKey: unknown;
      key: string;
      preventDefault: () => void;
    }) => {
      if (event.ctrlKey && event.key === 'k') {
        event.preventDefault();
        handleOpen();
      }
    };

    if (open) {
      window.addEventListener('keydown', handleGlobalKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [open]);

  return (
    <div>
      <IconButton onClick={handleOpen}>{/* <SearchIcon /> */}</IconButton>

      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth="sm"
        sx={{
          '& .MuiDialog-paper': {
            maxHeight: '80vh',
            overflow: 'auto',
          },
        }}
      >
        <DialogContent>
          <Box>
            <TextField
              autoFocus
              fullWidth
              placeholder="Search..."
              value={searchTerm}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown} // Listen for arrow keys
            />

            <List>
              {filteredOptions.map((option, index) => (
                <ListItem
                  key={index}
                  onClick={() => {
                    if (option.shortcut) {
                      console.log(`Triggering: ${option.shortcut}`);
                      hotkeys.trigger(option.shortcut);
                    }
                    handleClose();
                  }}
                  component={'div'}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    backgroundColor:
                      index === selectedIndex
                        ? 'rgba(0, 0, 255, 0.1)'
                        : 'transparent',
                    '&:hover': {backgroundColor: 'rgba(0, 0, 255, 0.2)'},
                  }}
                >
                  {/* Primary Text */}
                  <Box>
                    <ListItemText primary={option.displayText} />
                  </Box>

                  {/* Secondary Text */}
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      {option.shortcut}
                    </Typography>
                  </Box>
                </ListItem>
              ))}
            </List>
          </Box>
        </DialogContent>
      </Dialog>
    </div>
  );
};
