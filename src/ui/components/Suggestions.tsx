import { Box, Chip, useTheme } from '@mui/material';
import React, { memo } from 'react';

interface Suggestion {
  text: string;
  type: 'followup' | 'clarification' | 'analysis';
}

interface SuggestionsProps {
  suggestions: Suggestion[];
  onSuggestionClick: (suggestion: Suggestion) => void;
}

const SuggestionChip = memo(({ suggestion, onClick }: { suggestion: Suggestion; onClick: () => void }) => {
  const theme = useTheme();
  return (
    <Chip
      label={suggestion.text}
      onClick={onClick}
      role="button"
      aria-label={`Suggestion: ${suggestion.text}`}
      sx={{
        'bgcolor': theme.palette.primary.main,
        'color': theme.palette.primary.contrastText,
        '&:hover': {
          bgcolor: theme.palette.primary.dark,
        },
      }}
    />
  );
});

SuggestionChip.displayName = 'SuggestionChip';

export const Suggestions: React.FC<SuggestionsProps> = memo(({ suggestions, onSuggestionClick }) => {
  const theme = useTheme();

  if (!suggestions.length)
    return null;

  return (
    <Box
      role="region"
      aria-label="Suggested responses"
      sx={{
        p: 2,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        borderTop: `1px solid ${theme.palette.divider}`,
        bgcolor: theme.palette.background.paper,
      }}
    >
      {suggestions.map((suggestion, index) => (
        <SuggestionChip
          key={index}
          suggestion={suggestion}
          onClick={() => onSuggestionClick(suggestion)}
        />
      ))}
    </Box>
  );
});

Suggestions.displayName = 'Suggestions';
