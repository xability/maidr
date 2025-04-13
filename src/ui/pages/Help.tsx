import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Typography,
} from '@mui/material';
import { useAppDispatch, useAppSelector } from '@redux/hook/useStore';
import { toggleHelpMenu } from '@redux/slice/helpSlice';
import React from 'react';

interface HelpRowProps {
  label: string;
  shortcut: string;
}

const HelpRow: React.FC<HelpRowProps> = ({ label, shortcut }) => (
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

const Help: React.FC = () => {
  const dispatch = useAppDispatch();
  const { enabled, items } = useAppSelector(state => state.help);

  const handleClose = (): void => {
    dispatch(toggleHelpMenu());
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
      <Grid container component={DialogTitle}>
        <Grid size="grow">
          <Typography variant="h6" fontWeight="bold">
            Keyboard Shortcuts
          </Typography>
        </Grid>
      </Grid>

      <DialogContent>
        <Grid container spacing={1}>
          {items.map((item, index) => (
            <React.Fragment key={index}>
              <Grid size={12} key={index}>
                <HelpRow
                  label={item.description}
                  shortcut={item.key}
                />
              </Grid>
              {index !== items.length - 1 && (
                <Grid size={12}>
                  <Divider />
                </Grid>
              )}
            </React.Fragment>
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
            <Button variant="contained" color="primary" onClick={handleClose}>
              Close
            </Button>
          </Grid>
        </Grid>
      </Grid>
    </Dialog>
  );
};

export default Help;
