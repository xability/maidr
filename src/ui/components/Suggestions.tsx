import type { Suggestion } from '@type/chat';
import { Box, Chip, useTheme } from '@mui/material';
import React, { memo } from 'react';

interface SuggestionsProps {
  suggestions: Suggestion[];
  onSuggestionClick: (suggestion: Suggestion) => void;
}

const SuggestionChip = memo(({ suggestion, onClick }: { suggestion: Suggestion; onClick: () => void }) => {
  const theme = useTheme();
  const styles = {
    chip: {
      'bgcolor': theme.palette.primary.main,
      'color': theme.palette.primary.contrastText,
      '&:hover': {
        bgcolor: theme.palette.primary.dark,
      },
    },
  };

  return (
    <Chip
      label={suggestion.text}
      onClick={onClick}
      role="button"
      aria-label={`Suggestion: ${suggestion.text}`}
      sx={styles.chip}
    />
  );
});

SuggestionChip.displayName = 'SuggestionChip';

export const Suggestions: React.FC<SuggestionsProps> = memo(({ suggestions, onSuggestionClick }) => {
  const theme = useTheme();

  if (!suggestions.length)
    return null;

  const styles = {
    suggestionsContainer: {
      p: 2,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 1,
      borderTop: `1px solid ${theme.palette.divider}`,
      bgcolor: theme.palette.background.paper,
    },
  };

  return (
    <Box
      role="region"
      aria-label="Suggested responses"
      sx={styles.suggestionsContainer}
    >
      {suggestions.map(suggestion => (
        <SuggestionChip
          key={suggestion.id}
          suggestion={suggestion}
          onClick={() => onSuggestionClick(suggestion)}
        />
      ))}
    </Box>
  );
});

Suggestions.displayName = 'Suggestions';
