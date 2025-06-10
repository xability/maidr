import SearchIcon from '@mui/icons-material/Search';
import { InputAdornment, TextField } from '@mui/material';
import React from 'react';

interface HelpSearchProps {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const HelpSearch: React.FC<HelpSearchProps> = ({ value, onChange }) => (
  <>
    <TextField
      fullWidth
      variant="outlined"
      placeholder="Type a few letters to search..."
      value={value}
      onChange={onChange}
      className="help-search"
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon aria-hidden="true" />
            </InputAdornment>
          ),
        },
      }}
      aria-label="Search keyboard shortcuts"
      aria-describedby="search-description"
      role="searchbox"
    />
    <div
      id="search-description"
    >
      Enter characters to search for keyboard shortcuts.
    </div>
  </>
);
