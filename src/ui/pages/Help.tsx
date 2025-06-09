import type { HelpMenuItem } from '@type/help';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Typography,
} from '@mui/material';
import { useViewModel } from '@state/hook/useViewModel';
import { HelpGroup } from '@ui/components/help/HelpGroup';
import { HelpSearch } from '@ui/components/help/HelpSearch';
import { HELP_GROUP_FILTERS, HELP_GROUPS } from '@ui/react_constants';
import React, { useId, useMemo, useState } from 'react';

const Help: React.FC = () => {
  const id = useId();
  const titleId = useId();
  const descriptionId = useId();
  const viewModel = useViewModel('help');
  const { items } = viewModel.state;
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Group items by purpose
  const navigationItems = items.filter(item => HELP_GROUP_FILTERS.Navigation(item));
  const modeItems = items.filter(item => HELP_GROUP_FILTERS.Modes(item));
  const autoplayItems = items.filter(item => HELP_GROUP_FILTERS['Autoplay Controls'](item));
  const labelItems = items.filter(item => HELP_GROUP_FILTERS['Label Announcements'](item));
  const generalItems = items.filter(item =>
    HELP_GROUP_FILTERS['General Controls'](item, [navigationItems, modeItems, autoplayItems, labelItems]),
  );

  const getGroupItems = (groupTitle: string): HelpMenuItem[] => {
    switch (groupTitle) {
      case 'Navigation':
        return navigationItems;
      case 'Modes':
        return modeItems;
      case 'Autoplay Controls':
        return autoplayItems;
      case 'Label Announcements':
        return labelItems;
      case 'General Controls':
        return generalItems;
      default:
        return [];
    }
  };

  const handleClose = (): void => {
    viewModel.toggle();
  };

  const handleGroupToggle = (groupTitle: string): void => {
    setExpandedGroup(expandedGroup === groupTitle ? null : groupTitle);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setSearchQuery(event.target.value);
    // Auto-expand groups that have matching items
    if (event.target.value) {
      const lowercasedQuery = event.target.value.toLowerCase();
      const matchingGroups = HELP_GROUPS.filter((groupTitle) => {
        const groupItems = getGroupItems(groupTitle);
        return groupItems.some(item =>
          item.description.toLowerCase().includes(lowercasedQuery)
          || item.key.toLowerCase().includes(lowercasedQuery),
        );
      });
      if (matchingGroups.length > 0) {
        setExpandedGroup(matchingGroups[0]);
      }
    } else {
      setExpandedGroup(null);
    }
  };

  // Check if any groups have matching items
  const hasMatchingItems = useMemo(() => {
    if (!searchQuery)
      return true;
    return HELP_GROUPS.some((groupTitle) => {
      const groupItems = getGroupItems(groupTitle);
      return groupItems.some(item =>
        item.description.toLowerCase().includes(searchQuery.toLowerCase())
        || item.key.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    });
  }, [searchQuery, navigationItems, modeItems, autoplayItems, labelItems, generalItems]);

  return (
    <Dialog
      id={id}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      open={true}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disablePortal
      className="help-dialog"
    >
      {/* Header */}
      <Grid container component={DialogTitle}>
        <Grid size="grow">
          <Typography id={titleId} variant="h6" fontWeight="bold">
            Keyboard Shortcuts
          </Typography>
        </Grid>
      </Grid>

      <DialogContent>
        <Typography id={descriptionId} variant="body2" sx={{ mb: 2 }}>
          Click on a section to view its shortcuts. Alternatively, use the search bar to find specific shortcuts.
        </Typography>

        <HelpSearch value={searchQuery} onChange={handleSearchChange} />

        {!hasMatchingItems && searchQuery && (
          <Typography
            variant="body1"
            color="text.secondary"
            align="center"
            className="help-no-results"
            role="status"
            aria-live="polite"
          >
            No results found for "
            {searchQuery}
            "
          </Typography>
        )}

        <Grid
          container
          spacing={2}
          id="help-groups"
          role="region"
          aria-label="Keyboard shortcuts groups"
          className="help-group-list"
        >
          {HELP_GROUPS.map(groupTitle => (
            <Grid key={groupTitle} size={12} className="help-group">
              <HelpGroup
                title={groupTitle}
                items={getGroupItems(groupTitle)}
                isExpanded={expandedGroup === groupTitle}
                onToggle={() => handleGroupToggle(groupTitle)}
                searchQuery={searchQuery}
              />
            </Grid>
          ))}
        </Grid>
      </DialogContent>

      {/* Footer Actions */}
      <Grid container component={DialogActions}>
        <Grid
          size="grow"
          container
          spacing={1}
          justifyContent="flex-end"
          sx={{ px: 2, py: 1 }}
        >
          <Grid size="auto">
            <Button
              variant="contained"
              color="primary"
              onClick={handleClose}
              aria-label="Close keyboard shortcuts dialog"
            >
              Close
            </Button>
          </Grid>
        </Grid>
      </Grid>
    </Dialog>
  );
};

export default Help;
