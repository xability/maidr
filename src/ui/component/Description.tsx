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
import { useModalContainer } from '@state/hook/useModalContainer';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import React, { useId, useState } from 'react';

const DEFAULT_ROW_LIMIT = 100;

interface DataTableProps {
  headers: string[];
  rows: (string | number)[][];
  title?: string;
}

const DataTable: React.FC<DataTableProps> = ({ headers, rows, title }) => {
  const [showAll, setShowAll] = useState(false);
  const isTruncated = rows.length > DEFAULT_ROW_LIMIT;
  const displayedRows = showAll ? rows : rows.slice(0, DEFAULT_ROW_LIMIT);

  return (
    <>
      <Typography variant="subtitle2" component="h3" fontWeight="bold" sx={{ mt: 1, mb: 1 }}>
        Data
        {' '}
        (
        {rows.length}
        {' '}
        {rows.length === 1 ? 'row' : 'rows'}
        )
      </Typography>
      <TableContainer sx={{ maxHeight: 300 }}>
        <Table size="small" stickyHeader aria-label={isDisplayable(title) ? `Chart data for ${title}` : 'Chart data'}>
          <TableHead>
            <TableRow>
              {headers.map((header, i) => (
                <TableCell key={i} sx={{ fontWeight: 'bold' }}>
                  {formatCell(header)}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedRows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={cellIndex}>{formatCell(cell)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {isTruncated && (
        <Button
          size="small"
          onClick={() => setShowAll(!showAll)}
          aria-expanded={showAll}
          sx={{ mt: 1 }}
        >
          {showAll ? 'Show less' : `Show all ${rows.length} rows`}
        </Button>
      )}
    </>
  );
};

/**
 * Checks whether a value is presentable in the UI.
 * Filters out null, undefined, NaN, empty strings, and known placeholder defaults.
 */
function isDisplayable(value: unknown): boolean {
  if (value == null)
    return false;
  if (typeof value === 'number')
    return Number.isFinite(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed !== '' && trimmed !== 'undefined' && trimmed !== 'unavailable';
  }
  return true;
}

/**
 * Formats a cell value for display. Non-displayable values become an empty string.
 */
function formatCell(value: unknown): string {
  if (!isDisplayable(value))
    return '';
  return String(value);
}

const Description: React.FC = () => {
  const id = useId();
  const viewModel = useViewModel('description');
  const { data } = useViewModelState('description');
  const { modalRef, container } = useModalContainer();

  const handleClose = (): void => {
    viewModel.toggle();
  };

  if (!data) {
    return null;
  }

  const axisEntries = Object.entries(data.axes).filter(
    ([, value]) => isDisplayable(value),
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
      ref={modalRef}
      container={container}
      aria-modal="true"
      aria-labelledby={`${id}-title`}
    >
      {/* The id sits on `DialogTitle` itself rather than on a `Typography`
          inside it. MUI resolves the title's id as `idProp ?? titleId`, where
          `titleId` is the `aria-labelledby` above — so an inner element
          carrying that id leaves two elements claiming it, and the wrapper
          being a heading too puts the title in the outline twice. */}
      <DialogTitle id={`${id}-title`} sx={{ fontWeight: 'bold' }}>
        Chart Description
      </DialogTitle>

      <DialogContent>
        {/* Chart type and title */}
        {isDisplayable(data.chartType) && (
          <Typography variant="body2">
            Chart Type:
            {' '}
            {data.chartType}
          </Typography>
        )}
        {isDisplayable(data.title) && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            Title:
            {' '}
            {data.title}
          </Typography>
        )}

        {/* Subplots (multi-panel only) */}
        {data.subplots && data.subplots.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" component="h3" fontWeight="bold" sx={{ mt: 1 }}>
              Subplots
              {' '}
              (
              {data.subplots.length}
              )
            </Typography>
            {data.subplots.map(subplot => (
              <Typography key={subplot.index} variant="body2">
                {subplot.index}
                .
                {' '}
                {subplot.traceTypes.filter(isDisplayable).join(', ') || 'unknown'}
                {isDisplayable(subplot.title) && ` — ${subplot.title}`}
                {subplot.isActive && ' (current)'}
              </Typography>
            ))}
          </>
        )}

        <Divider sx={{ my: 1 }} />

        {/* Axes */}
        {axisEntries.length > 0 && (
          <>
            <Typography variant="subtitle2" component="h3" fontWeight="bold" sx={{ mt: 1 }}>
              Axes
            </Typography>
            {axisEntries.map(([key, value]) => (
              <Typography key={key} variant="body2">
                {key.toUpperCase()}
                :
                {value}
              </Typography>
            ))}
            <Divider sx={{ my: 1 }} />
          </>
        )}

        {/* Stats */}
        {data.stats.length > 0 && (
          <>
            <Typography variant="subtitle2" component="h3" fontWeight="bold" sx={{ mt: 1 }}>
              Summary
            </Typography>
            {data.stats
              .filter(stat => isDisplayable(stat.value))
              .map((stat, index) => (
                <Typography key={index} variant="body2">
                  {stat.label}
                  :
                  {stat.value}
                </Typography>
              ))}
            <Divider sx={{ my: 1 }} />
          </>
        )}

        {/* Data table */}
        {data.dataTable.rows.length > 0 && (
          <DataTable headers={data.dataTable.headers} rows={data.dataTable.rows} title={data.title} />
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
