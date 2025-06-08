import type { HelpMenuItem } from '@type/help';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { Collapse, Divider, Grid, IconButton, Typography } from '@mui/material';
import React, { useId, useMemo } from 'react';
import { HelpRow } from './HelpRow';

interface HelpGroupProps {
  title: string;
  items: HelpMenuItem[];
  isExpanded: boolean;
  onToggle: () => void;
  searchQuery: string;
}

export const HelpGroup: React.FC<HelpGroupProps> = ({ title, items, isExpanded, onToggle, searchQuery }) => {
  const contentId = useId();
  const buttonId = useId();

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery)
      return items;
    const query = searchQuery.toLowerCase();
    return items.filter(item =>
      item.description.toLowerCase().includes(query)
      || item.key.toLowerCase().includes(query),
    );
  }, [items, searchQuery]);

  // Don't render group if no items match the search
  if (searchQuery && filteredItems.length === 0) {
    return null;
  }

  return (
    <Grid container spacing={1} className="help-group">
      <Grid size={12} className="help-group-header">
        <IconButton
          id={buttonId}
          onClick={onToggle}
          sx={{ p: 0, mr: 1 }}
          aria-expanded={isExpanded}
          aria-controls={contentId}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${title} section`}
        >
          {isExpanded ? <KeyboardArrowDownIcon /> : <KeyboardArrowRightIcon />}
        </IconButton>
        <Typography
          variant="subtitle1"
          component="span"
          className="help-group-title"
          fontWeight="bold"
          onClick={onToggle}
        >
          {title}
        </Typography>
      </Grid>
      <Grid size={12}>
        <Collapse in={isExpanded}>
          <div
            id={contentId}
            role="region"
            aria-label={`${title} shortcuts`}
          >
            <Grid container spacing={1}>
              {filteredItems.map((item, index) => (
                <React.Fragment key={index}>
                  <Grid size={12} className="help-row">
                    <HelpRow
                      label={item.description}
                      shortcut={item.key}
                    />
                  </Grid>
                  {index !== filteredItems.length - 1 && (
                    <Grid size={12}>
                      <Divider />
                    </Grid>
                  )}
                </React.Fragment>
              ))}
            </Grid>
          </div>
        </Collapse>
      </Grid>
    </Grid>
  );
};
