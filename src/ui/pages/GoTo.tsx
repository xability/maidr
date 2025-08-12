import {
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import { useViewModel } from '@state/hook/useViewModel';
import React, { useEffect, useId, useRef } from 'react';

const GoTo: React.FC = () => {
  const id = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const viewModel = useViewModel('goTo');
  const { visible, items, selectedIndex, error } = viewModel.state;

  // Focus the listbox when modal opens
  useEffect(() => {
    if (visible && listRef.current) {
      // Small delay to ensure dialog is fully rendered
      const timeoutId = setTimeout(() => {
        listRef.current?.focus();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [visible]);

  // Handle keyboard navigation on the listbox
  const handleListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>): void => {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        viewModel.moveUp();
        break;
      case 'ArrowDown':
        event.preventDefault();
        viewModel.moveDown();
        break;
      case 'Enter':
        event.preventDefault();
        viewModel.executeSelection();
        break;
      case 'Escape':
        event.preventDefault();
        viewModel.close();
        break;
    }
  };

  const handleClose = (): void => {
    viewModel.close();
  };

  const handleItemClick = (index: number): void => {
    // Update selection and execute
    const currentSelection = selectedIndex;
    let selectionIndex = currentSelection;

    while (selectionIndex !== index) {
      if (selectionIndex < index) {
        viewModel.moveDown();
        selectionIndex++;
      } else {
        viewModel.moveUp();
        selectionIndex--;
      }
    }
    viewModel.executeSelection();
  };

  if (!visible) {
    return null;
  }

  return (
    <Dialog
      id={id}
      role="dialog"
      open={true}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      disablePortal
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
    >
      {/* Header */}
      <DialogTitle id={`${id}-title`}>
        <Typography variant="h6" fontWeight="bold">
          Go to Extrema
        </Typography>
        <Typography variant="body2" color="text.secondary" id={`${id}-description`}>
          Select an extremum to jump to
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {error
          ? (
              <Typography
                variant="body2"
                color="error"
                sx={{ p: 2 }}
                role="alert"
              >
                {error}
              </Typography>
            )
          : (
              <List
                ref={listRef}
                role="listbox"
                tabIndex={0}
                onKeyDown={handleListKeyDown}
                aria-activedescendant={selectedIndex >= 0 && selectedIndex < items.length
                  ? `${id}-item-${selectedIndex}`
                  : undefined}
                aria-label="Extrema options"
                sx={{
                  '&:focus': {
                    outline: 'none',
                  },
                }}
              >
                {items.map((item, index) => (
                  <ListItem
                    key={index}
                    disablePadding
                    role="option"
                    aria-selected={index === selectedIndex}
                  >
                    <ListItemButton
                      id={`${id}-item-${index}`}
                      selected={index === selectedIndex}
                      onClick={() => handleItemClick(index)}
                      sx={{
                        '&.Mui-selected': {
                          'backgroundColor': 'primary.main',
                          'color': 'primary.contrastText',
                          '&:hover': {
                            backgroundColor: 'primary.dark',
                          },
                        },
                      }}
                    >
                      <ListItemText
                        primary={item.label}
                        secondary={item.occurrenceInfo}
                        secondaryTypographyProps={{
                          sx: {
                            color: index === selectedIndex ? 'inherit' : 'text.secondary',
                          },
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
      </DialogContent>
    </Dialog>
  );
};

export default GoTo;
