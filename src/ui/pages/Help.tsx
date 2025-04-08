import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid2,
  Typography,
} from '@mui/material';
import { useViewModel } from '@state/hook/useViewModel';
import React from 'react';

interface HelpRowProps {
  label: string;
  shortcut: string;
}

const HelpRow: React.FC<HelpRowProps> = ({ label, shortcut }) => (
  <Grid2
    container
    spacing={1}
    alignItems="center"
    sx={{ py: 1 }}
  >
    <Grid2 size={{ xs: 12, sm: 6, md: 7 }}>
      <Typography variant="body2">
        {label}
      </Typography>
    </Grid2>
    <Grid2 size={{ xs: 12, sm: 6, md: 5 }}>
      <Typography variant="body2" fontWeight={300}>
        {shortcut}
      </Typography>
    </Grid2>
  </Grid2>
);

const Help: React.FC = () => {
  const viewModel = useViewModel('help');
  const { enabled, items } = viewModel.state;

  const handleClose = (): void => {
    viewModel.toggle();
  };

  return (
    <Dialog
      role="dialog"
      open={enabled}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disablePortal
      closeAfterTransition={false}
    >
      {/* Header */}
      <Grid2 container component={DialogTitle}>
        <Grid2 size="grow">
          <Typography variant="h6" fontWeight="bold">
            Keyboard Shortcuts
          </Typography>
        </Grid2>
      </Grid2>

      <DialogContent>
        <Grid2 container spacing={1}>
          {items.map((item, index) => (
            <React.Fragment key={index}>
              <Grid2 size={12} key={index}>
                <HelpRow
                  label={item.description}
                  shortcut={item.key}
                />
              </Grid2>
              {index !== items.length - 1 && (
                <Grid2 size={12}>
                  <Divider />
                </Grid2>
              )}
            </React.Fragment>
          ))}
        </Grid2>
      </DialogContent>

      {/* Footer Actions */}
      <Grid2 container component={DialogActions}>
        <Grid2
          size="grow"
          container
          spacing={1}
          justifyContent="flex-end"
          sx={{ px: 2, py: 1 }}
        >
          <Grid2 size="auto">
            <Button variant="contained" color="primary" onClick={handleClose}>
              Close
            </Button>
          </Grid2>
        </Grid2>
      </Grid2>
    </Dialog>
  );
};

export default Help;
