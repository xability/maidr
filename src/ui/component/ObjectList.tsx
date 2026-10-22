import type { ObjectListRow } from '@service/objectList';
import { Close } from '@mui/icons-material';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { useLocale } from '@state/hook/useLocale';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import { visuallyHidden } from '@ui/visuallyHidden';
import React, { useCallback, useLayoutEffect, useRef } from 'react';

interface ObjectRowProps {
  row: ObjectListRow;
  index: number;
  count: number;
  isSelected: boolean;
  /** What the row is called, which on a fresh arrangement starts with the summary. */
  name: string;
  currentLabel: string;
  onSelect: (index: number) => void;
  rowRef: React.Ref<HTMLDivElement> | null;
}

/**
 * One object in the list. Memoised, so moving the selection re-renders the
 * row losing it and the row gaining it rather than every node of a large
 * graph.
 */
const ObjectRow = React.memo(({
  row,
  index,
  count,
  isSelected,
  name,
  currentLabel,
  onSelect,
  rowRef,
}: ObjectRowProps): React.JSX.Element => (
  <Box
    ref={rowRef}
    id={`object-list-option-${index}`}
    role="option"
    aria-selected={isSelected}
    // A screen reader says "current" for the reader's own place in the chart,
    // the way a sighted reader sees the marker below.
    aria-current={row.current ? 'true' : undefined}
    aria-label={name}
    aria-setsize={count}
    aria-posinset={index + 1}
    // Roving tabindex: the selection effect moves focus here, and only the
    // selected row is a tab stop.
    tabIndex={isSelected ? 0 : -1}
    onClick={() => onSelect(index)}
    sx={{
      'p': 1,
      'mb': 0.5,
      'border': isSelected ? 2 : 1,
      'borderColor': isSelected ? 'primary.main' : 'divider',
      'borderRadius': 1,
      'cursor': 'pointer',
      'bgcolor': isSelected ? 'action.selected' : 'transparent',
      'outline': 'none',
      '&:hover': { bgcolor: 'action.hover' },
      '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: 1 },
    }}
  >
    <Typography variant="body2" sx={{ fontWeight: 600 }}>
      {row.label}
      {row.current && (
        <Typography component="span" variant="caption" aria-hidden="true" sx={{ ml: 1, fontWeight: 400 }}>
          {`(${currentLabel})`}
        </Typography>
      )}
    </Typography>
    {row.detail !== '' && (
      <Typography variant="caption" color="text.secondary" component="div">
        {row.detail}
      </Typography>
    )}
  </Box>
));
ObjectRow.displayName = 'ObjectRow';

/**
 * Stops a key from reaching the object list's scope bindings, so the browser
 * presses the button instead. Every binding calls `preventDefault`, which
 * would cancel the click Enter and Space make on a button -- and Enter is
 * bound to the jump, so Enter on Close would have jumped.
 * @param event - The keydown on a button
 */
function keepKeyOnButton(event: React.KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.stopPropagation();
  }
}

/**
 * The object list (`o`): every node, tile or region of a chart without axes,
 * to sort, narrow and jump from.
 *
 * Keys are handled by the OBJECT_LIST scope, so this only renders the list
 * and moves focus onto the selected row; that focus move is what a screen
 * reader announces, with the row's position from `aria-posinset`. The dialog
 * has a live region of its own, inside it, for what a focus move cannot say:
 * the ends of the list, a new order chosen from a button, and a key with
 * nothing to change. It is inside the dialog because the dialog is modal, and
 * a region outside it is not reliably read.
 *
 * Hand-rolled rather than MUI's modal so the arrows and Escape keep reaching
 * the scope bindings, with a Tab trap of its own.
 */
const ObjectList: React.FC = () => {
  const { t } = useLocale();
  const viewModel = useViewModel('objectList');
  const state = useViewModelState('objectList');

  const dialogRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Focus follows the selection, in the same task as the render, so a row
  // replaced by a new arrangement never leaves focus on the page -- from
  // wherever focus was, a button included, since a key that changed the list
  // while focus stayed put would change it out of earshot. The one exception
  // is a press of the Order or Showing button itself: focus stays on it, so
  // pressing it again presses it again rather than jumping.
  useLayoutEffect(() => {
    const row = selectedRef.current;
    if (row === null || state.keepFocus) {
      return;
    }
    row.focus();
    row.scrollIntoView?.({ block: 'nearest' });
  }, [state.selectedIndex, state.revision, state.keepFocus]);

  const handleSelect = useCallback((index: number): void => {
    viewModel.selectIndex(index);
  }, [viewModel]);

  // Trap Tab within the dialog: its buttons and the selected row.
  const handleDialogKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Tab' || dialogRef.current === null) {
      return;
    }
    const focusables = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>('button, [role="option"][tabindex="0"]'),
    );
    if (focusables.length === 0) {
      return;
    }
    event.preventDefault();
    const at = focusables.indexOf(document.activeElement as HTMLElement);
    const next = (at + (event.shiftKey ? -1 : 1) + focusables.length) % focusables.length;
    focusables[next].focus();
  };

  // Space on a row would scroll the list; nothing in the list uses it.
  const handleListKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === ' ') {
      event.preventDefault();
    }
  };

  if (state.rows.length === 0) {
    return null;
  }

  const count = state.rows.length;
  const nameOf = (row: ObjectListRow): string =>
    row.detail === '' ? row.label : `${row.label}${t('dialogs.objectListSeparator')}${row.detail}`;

  return (
    <>
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9999,
        }}
        onClick={() => viewModel.hide()}
        aria-hidden="true"
      />

      <Box
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="object-list-title"
        aria-describedby="object-list-description"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        sx={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          bgcolor: 'background.paper',
          // Its own text colour, as MUI's Paper sets one: inherited, text would
          // take the light colour high contrast gives the chart's backdrop.
          color: 'text.primary',
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          p: 3,
          boxShadow: 3,
          zIndex: 10000,
          minWidth: 320,
          maxWidth: 480,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          outline: 'none',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography id="object-list-title" variant="h6" component="h2" sx={{ m: 0, fontWeight: 600 }}>
            {t('dialogs.objectListTitle')}
          </Typography>
          <IconButton
            onClick={() => viewModel.hide()}
            onKeyDown={keepKeyOnButton}
            aria-label={t('dialogs.objectListClose')}
            size="small"
          >
            <Close />
          </IconButton>
        </Box>

        <Typography id="object-list-description" variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {state.description}
        </Typography>

        {(state.canSort || state.canFilter) && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
            {state.canSort && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => viewModel.cycleSort(1, 'button')}
                onKeyDown={keepKeyOnButton}
                sx={{ textTransform: 'none' }}
              >
                {t('dialogs.objectListOrder', { sort: state.sortLabel })}
              </Button>
            )}
            {state.canFilter && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => viewModel.cycleFilter(1, 'button')}
                onKeyDown={keepKeyOnButton}
                sx={{ textTransform: 'none' }}
              >
                {t('dialogs.objectListShowing', { filter: state.filterLabel })}
              </Button>
            )}
          </Box>
        )}

        <Typography id="object-list-summary" variant="body2" sx={{ mb: 1 }}>
          {state.summary}
        </Typography>

        <Box
          role="listbox"
          aria-labelledby="object-list-summary"
          onKeyDown={handleListKeyDown}
          sx={{ overflowY: 'auto', maxHeight: 360, border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}
        >
          {state.rows.map((row, index) => {
            const isSelected = index === state.selectedIndex;
            const name = isSelected && state.announceSummary
              ? t('dialogs.objectListChanged', { summary: state.summary, object: nameOf(row) })
              : nameOf(row);
            return (
              <ObjectRow
                // A new arrangement mounts new rows, so moving focus to the
                // first is announced even when the selection was on row 0.
                key={`${state.revision}:${index}`}
                row={row}
                index={index}
                count={count}
                isSelected={isSelected}
                name={name}
                currentLabel={t('dialogs.objectListCurrent')}
                onSelect={handleSelect}
                rowRef={isSelected ? selectedRef : null}
              />
            );
          })}
        </Box>

        {/* Assertive: it answers the reader's own key press. Each message is a
            new child, so the same message twice is announced twice. */}
        <div aria-live="assertive" aria-atomic="true" style={visuallyHidden}>
          {state.message !== null && <div key={state.message.id}>{state.message.text}</div>}
        </div>
      </Box>
    </>
  );
};

export default ObjectList;
