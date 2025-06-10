import { Grid, Typography } from '@mui/material';
import React from 'react';

interface HelpRowProps {
  label: string;
  shortcut: string;
}

export const HelpRow: React.FC<HelpRowProps> = ({ label, shortcut }) => (
  <Grid
    container
    spacing={1}
    alignItems="center"
    sx={{ py: 1 }}
  >
    <Grid size={{ xs: 12, sm: 6, md: 7 }}>
      <Typography variant="body2">
        {label}
      </Typography>
    </Grid>
    <Grid size={{ xs: 12, sm: 6, md: 5 }}>
      <Typography variant="body2" fontWeight={300}>
        {shortcut}
      </Typography>
    </Grid>
  </Grid>
);
