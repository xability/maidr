import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import React, { useId } from 'react';

const Description: React.FC = () => {
  const id = useId();
  const viewModel = useViewModel('description');
  const { data } = useViewModelState('description');

  const handleClose = (): void => {
    viewModel.toggle();
  };

  if (!data) {
    return null;
  }

  const axisEntries = Object.entries(data.axes).filter(
    ([, value]) => value != null && value !== '' && value !== 'undefined',
  );

  return (
    <Dialog
      id={id}
      role="dialog"
      open={true}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      disablePortal
    >
      <Grid container component={DialogTitle}>
        <Grid size="grow">
          <Typography variant="h6" fontWeight="bold">
            Chart Description
          </Typography>
        </Grid>
      </Grid>

      <DialogContent>
        {/* Chart type and title */}
        {data.chartType && (
          <Typography variant="body2">
            Chart Type: {data.chartType}
          </Typography>
        )}
        {data.title && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            Title: {data.title}
          </Typography>
        )}

        <Divider sx={{ my: 1 }} />

        {/* Axes */}
        {axisEntries.length > 0 && (
          <>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ mt: 1 }}>
              Axes
            </Typography>
            {axisEntries.map(([key, value]) => (
              <Typography key={key} variant="body2">
                {key.toUpperCase()}: {value}
              </Typography>
            ))}
            <Divider sx={{ my: 1 }} />
          </>
        )}

        {/* Stats */}
        {data.stats.length > 0 && (
          <>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ mt: 1 }}>
              Summary
            </Typography>
            {data.stats
              .filter(stat => stat.value != null && stat.value !== '' && stat.value !== 'undefined')
              .map((stat, index) => (
                <Typography key={index} variant="body2">
                  {stat.label}: {stat.value}
                </Typography>
              ))}
            <Divider sx={{ my: 1 }} />
          </>
        )}

        {/* Data table */}
        {data.dataTable.rows.length > 0 && (
          <>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ mt: 1, mb: 1 }}>
              Data
            </Typography>
            <TableContainer sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {data.dataTable.headers.map((header, i) => (
                      <TableCell key={i} sx={{ fontWeight: 'bold' }}>
                        {header}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.dataTable.rows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={cellIndex}>{cell}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </DialogContent>

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

export default Description;
