import type { LayerSummary } from '@type/state';
import {
  Box,
  Button,
  ButtonBase,
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
import { visuallyHidden } from '@ui/visuallyHidden';
import React, { useEffect, useId, useRef, useState } from 'react';

const DEFAULT_ROW_LIMIT = 100;

interface DataTableProps {
  headers: string[];
  rows: (string | number)[][];
  title?: string;
}

const DataTable: React.FC<DataTableProps> = ({ headers, rows, title }) => {
  const [shown, setShown] = useState(DEFAULT_ROW_LIMIT);
  const displayedRows = rows.slice(0, shown);
  const remaining = rows.length - displayedRows.length;
  const noun = rows.length === 1 ? 'row' : 'rows';
  // The count the table actually shows, not the count it holds. The heading
  // used to state the full total over a table cut off at a hundred, so a
  // reader who reached the last rendered row had been told there were five
  // thousand and was given no signal that the rest were missing.
  const caption = remaining > 0
    ? `Data: showing ${displayedRows.length} of ${rows.length} ${noun}`
    : `Data: ${rows.length} ${noun}`;
  const name = isDisplayable(title) ? `Chart data for ${title}` : 'Chart data';

  return (
    <>
      <Typography variant="subtitle2" component="h3" fontWeight="bold" sx={{ mt: 1, mb: 1 }}>
        {caption}
      </Typography>
      {/* Focusable and named: `maxHeight` makes this a scroll container, and a
          scroll container that is not a tab stop cannot be scrolled by anyone
          without a mouse. */}
      <TableContainer sx={{ maxHeight: 300 }} tabIndex={0} role="region" aria-label={name}>
        <Table size="small" stickyHeader>
          {/* A caption is the first thing a screen reader announces on
              entering a table, which is where the truncation has to be said
              for it to be heard before the rows it applies to. It carries the
              table's name too, so the region above and the table are not two
              elements announcing the same string. */}
          <caption style={visuallyHidden}>{`${name}. ${caption}.`}</caption>
          <TableHead>
            <TableRow>
              {headers.map((header, i) => (
                <TableCell key={i} sx={{ fontWeight: 'bold' }}>
                  {/* A blank header would leave an unnamed column, and every
                      cell under it unlabelled with it. */}
                  {formatCell(header) || `Column ${i + 1}`}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedRows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  // The first cell is the row's identity in every trace's
                  // table -- the category, the group, the x value -- so it is
                  // the row's header, and marking it up as one is what lets a
                  // screen reader read "Setosa, petal width, 0.2" instead of
                  // three bare numbers.
                  cellIndex === 0
                    ? (
                        <TableCell key={cellIndex} component="th" scope="row">
                          {formatCell(cell)}
                        </TableCell>
                      )
                    : <TableCell key={cellIndex}>{formatCell(cell)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {remaining > 0 && (
        <Button
          size="small"
          onClick={() => setShown(count => count + DEFAULT_ROW_LIMIT)}
          sx={{ mt: 1 }}
        >
          {`Show ${Math.min(DEFAULT_ROW_LIMIT, remaining)} more of ${rows.length} ${noun}`}
        </Button>
      )}
    </>
  );
};

interface LayerTabsProps {
  layers: LayerSummary[];
  focusedIndex: number;
  activeIndex: number;
  idBase: string;
  onSelect: (index: number) => void;
}

/**
 * The description dialog's layer tab strip.
 *
 * A multi-layer subplot is several charts drawn over one another, and the
 * description used to speak for whichever one the reader happened to be on,
 * without saying that the others existed. The strip says how many there are,
 * which one is being described, and offers the rest.
 *
 * Manual activation (WAI-ARIA's tabs pattern): moving along the strip moves
 * only the cursor, and Space confirms. Automatic activation would be wrong
 * here because selecting a tab is not a view change — it moves the reader's
 * layer in the chart itself, which is what makes Escape return them to the
 * layer they were last reading about. Passing over a layer on the way to
 * another should not relocate them.
 *
 * The arrow and Space keys are not handled here: they arrive through
 * `KeybindingService`'s DESCRIPTION scope like every other MAIDR key, so the
 * strip stays a view. What this does own is focus — the browser has to be told
 * where the cursor is for a screen reader to read the tab out.
 */
const LayerTabs: React.FC<LayerTabsProps> = ({ layers, focusedIndex, activeIndex, idBase, onSelect }) => {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    tabRefs.current[focusedIndex]?.focus();
  }, [focusedIndex]);

  const active = layers.find(layer => layer.index === activeIndex);

  return (
    <>
      <Typography id={`${idBase}-layers-label`} variant="subtitle2" component="h3" fontWeight="bold" sx={{ mt: 1 }}>
        Layers
        {' '}
        (
        {layers.length}
        )
      </Typography>
      <Typography variant="body2">
        {`Showing layer ${activeIndex + 1} of ${layers.length}`}
        {active ? `: ${active.label}` : ''}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Use the arrow keys to move between layers and Space to open one.
      </Typography>
      <Box
        role="tablist"
        aria-labelledby={`${idBase}-layers-label`}
        aria-orientation="horizontal"
        sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}
      >
        {layers.map(layer => (
          <ButtonBase
            key={layer.index}
            ref={(node: HTMLButtonElement | null) => {
              tabRefs.current[layer.index] = node;
            }}
            id={`${idBase}-layer-tab-${layer.index}`}
            role="tab"
            aria-selected={layer.index === activeIndex}
            aria-controls={`${idBase}-layer-panel`}
            // Roving tabindex, as the sibling dialogs' listboxes use: only the
            // cursor's tab is a tab stop, so Tab leaves the strip rather than
            // walking every layer of it.
            tabIndex={layer.index === focusedIndex ? 0 : -1}
            onClick={() => onSelect(layer.index)}
            sx={{
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              border: layer.index === activeIndex ? 2 : 1,
              borderColor: layer.index === activeIndex ? 'primary.main' : 'divider',
              bgcolor: layer.index === activeIndex ? 'action.selected' : 'transparent',
              fontWeight: layer.index === activeIndex ? 'bold' : 'normal',
              fontSize: '0.875rem',
            }}
          >
            {/* Not run through `formatCell`: the model guarantees a non-blank
                label (the producer's `name`, or the chart-type label), and a
                layer a producer genuinely called "unavailable" should be shown
                under that name rather than have its tab silently emptied. */}
            {layer.label}
          </ButtonBase>
        ))}
      </Box>
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
  const { data, focusedLayerIndex } = useViewModelState('description');
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
  // Filtered here rather than inside the map, so the "Summary" heading and its
  // rule are gated on what will actually render. A trace whose every stat is
  // non-finite -- which the service hands over as raw NaN precisely so the
  // view blanks it -- used to draw a heading over nothing.
  const displayableStats = data.stats.filter(stat => isDisplayable(stat.value));

  // Named for where it came from, the way `l t` announces the same
  // precedence: the dialog resolves a layer title from the figure's when the
  // layer authored none, and a bare "Title" left a reader in a multi-panel
  // figure unable to tell whether they were being told about this panel or
  // about the whole figure.
  const titleLabel = data.subplots && data.titleSource
    ? (data.titleSource === 'layer' ? 'Subplot title' : 'Figure title')
    : 'Title';

  const layers = data.layers ?? [];
  const activeLayerIndex = layers.find(layer => layer.isActive)?.index ?? -1;
  const hasLayerTabs = layers.length > 1 && activeLayerIndex >= 0;

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
        {/* Layer tabs (multi-layer subplots only) */}
        {hasLayerTabs && (
          <>
            <LayerTabs
              layers={layers}
              focusedIndex={focusedLayerIndex}
              activeIndex={activeLayerIndex}
              idBase={id}
              onSelect={index => viewModel.selectLayer(index)}
            />
            {/* What the tab itself cannot say: the panel below it now holds a
                different chart's description. Focus and `aria-selected` already
                announce the tab, so this deliberately does not repeat the
                layer's name — two announcements of one word is how a live
                region turns into noise. Keyed by the layer so coming back to
                one speaks again rather than silently. */}
            <div key={activeLayerIndex} role="status" style={visuallyHidden}>
              {`Description updated for layer ${activeLayerIndex + 1} of ${layers.length}`}
            </div>
            <Divider sx={{ my: 1 }} />
          </>
        )}

        <Box
          {...(hasLayerTabs && {
            'id': `${id}-layer-panel`,
            'role': 'tabpanel',
            'aria-labelledby': `${id}-layer-tab-${activeLayerIndex}`,
          })}
        >
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
              {titleLabel}
              {': '}
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

          {/* Axes.
              Each section from here down draws its own leading rule, the way
              the Subplots block above already does. A standalone rule used to
              sit here, so a description with no subplots, no axes and no stats
              -- reachable at the figure lobby -- rendered a separator with
              nothing on either side of it, which a screen reader announces. */}
          {axisEntries.length > 0 && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" component="h3" fontWeight="bold" sx={{ mt: 1 }}>
                Axes
              </Typography>
              {axisEntries.map(([key, value]) => (
                // `{' axis: '}` as one child, not a bare `:` on its own line:
                // JSX drops the whitespace around a text-only line, so the
                // three children used to concatenate to "X:Sepal Length".
                <Typography key={key} variant="body2">
                  {key.toUpperCase()}
                  {' axis: '}
                  {value}
                </Typography>
              ))}
            </>
          )}

          {/* Stats */}
          {displayableStats.length > 0 && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" component="h3" fontWeight="bold" sx={{ mt: 1 }}>
                Summary
              </Typography>
              {displayableStats.map((stat, index) => (
                <Typography key={index} variant="body2">
                  {stat.label}
                  {': '}
                  {stat.value}
                </Typography>
              ))}
            </>
          )}

          {/* Data table */}
          {data.dataTable.rows.length > 0 && (
            <>
              <Divider sx={{ my: 1 }} />
              <DataTable headers={data.dataTable.headers} rows={data.dataTable.rows} title={data.title} />
            </>
          )}
        </Box>
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
