import type { HelpMenuItem } from '@type/help';
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
import { useLocale } from '@state/hook/useLocale';
import { useModalContainer } from '@state/hook/useModalContainer';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import { comboFromKeyboardEvent } from '@util/keyCombo';
import React, { useCallback, useId, useState } from 'react';

/** Keys that are half of a chord: a recording waits through them. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

interface HelpRowProps {
  item: HelpMenuItem;
  /** Whether this row is waiting for the reader to press its new shortcut. */
  recording: boolean;
  onChange: (item: HelpMenuItem) => void;
  onReset: (item: HelpMenuItem) => void;
}

/**
 * One shortcut: what it does, what to press, and -- for a shortcut the
 * reader may change -- the buttons that change it or put the default back.
 *
 * The buttons carry the action's name in their accessible name, because a
 * column of buttons all called "Change" tells a screen reader user nothing
 * about which shortcut each one changes.
 */
const HelpRow: React.FC<HelpRowProps> = ({ item, recording, onChange, onReset }) => {
  const { t } = useLocale();
  const keyText = recording
    ? t('keybinding.helpRecordingHint')
    : item.isCustom && item.defaultKey !== undefined
      ? t('keybinding.helpCustomKey', { key: item.key, defaultKey: item.defaultKey })
      : item.key;

  return (
    <Grid
      container
      spacing={1}
      alignItems="center"
      sx={{ py: 1 }}
    >
      <Grid size={{ xs: 12, sm: 5, md: 5 }}>
        <Typography variant="body2">
          {item.description}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12, sm: 4, md: 4 }}>
        <Typography variant="body2" fontWeight={300}>
          {keyText}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12, sm: 3, md: 3 }} container spacing={1} justifyContent="flex-end">
        {item.commandKey !== undefined && (
          <Grid size="auto">
            <Button
              size="small"
              variant="outlined"
              aria-label={t('keybinding.helpChangeShortcutFor', { action: item.description })}
              aria-pressed={recording}
              onClick={() => onChange(item)}
            >
              {t('keybinding.helpChangeButton')}
            </Button>
          </Grid>
        )}
        {item.commandKey !== undefined && item.isCustom && (
          <Grid size="auto">
            <Button
              size="small"
              variant="text"
              aria-label={t('keybinding.helpResetShortcutFor', { action: item.description })}
              onClick={() => onReset(item)}
            >
              {t('keybinding.helpResetButton')}
            </Button>
          </Grid>
        )}
      </Grid>
    </Grid>
  );
};

const Help: React.FC = () => {
  const id = useId();
  const { t } = useLocale();
  const viewModel = useViewModel('help');
  const { items, status, statusRevision } = useViewModelState('help');
  const { modalRef, container } = useModalContainer();

  // The row whose new shortcut the reader is about to press, by command.
  // Local to the dialog: it is input in flight, not a fact about the help
  // menu, and it ends with the keydown that settles it.
  const [recording, setRecording] = useState<HelpMenuItem | null>(null);

  const handleClose = (): void => {
    viewModel.toggle();
  };

  const startRecording = useCallback((item: HelpMenuItem): void => {
    setRecording(item);
    viewModel.announce(t('keybinding.helpRecordingPrompt', { action: item.description }));
  }, [t, viewModel]);

  const resetOne = useCallback((item: HelpMenuItem): void => {
    if (item.commandKey !== undefined) {
      setRecording(null);
      viewModel.resetBinding(item.commandKey);
    }
  }, [viewModel]);

  /**
   * The keydown that settles a recording.
   *
   * Stopped before it leaves the dialog: hotkeys-js listens on the document,
   * and the whole point is that the key pressed here binds rather than runs;
   * and MUI closes the dialog on an Escape that reaches it, when Escape here
   * means "keep the old shortcut". Tab is the one key let through, so a
   * reader who changes their mind can still leave the button.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (recording === null || recording.commandKey === undefined) {
      return;
    }
    const native = event.nativeEvent;
    if (native.key === 'Tab') {
      setRecording(null);
      viewModel.announce(t('keybinding.helpRecordingCancelled'));
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    if (MODIFIER_KEYS.has(native.key)) {
      return;
    }
    if (native.key === 'Escape') {
      setRecording(null);
      viewModel.announce(t('keybinding.helpRecordingCancelled'));
      return;
    }
    const plain = !native.ctrlKey && !native.metaKey && !native.altKey && !native.shiftKey;
    if (native.key === 'Backspace' && plain) {
      setRecording(null);
      viewModel.resetBinding(recording.commandKey);
      return;
    }
    const combo = comboFromKeyboardEvent(native);
    if (combo === null) {
      viewModel.announce(t('keybinding.helpUnsupportedKey'));
      return;
    }
    setRecording(null);
    viewModel.rebind(recording.commandKey, combo);
  };

  const anyCustom = items.some(item => item.isCustom);

  return (
    <Dialog
      id={id}
      role="dialog"
      open={true}
      onClose={handleClose}
      disableEscapeKeyDown={recording !== null}
      maxWidth="sm"
      fullWidth
      disablePortal
      ref={modalRef}
      container={container}
    >
      {/* Header. `DialogTitle` is already a heading, so it carries the text
          directly — a heading `Typography` nested inside it would put
          "Keyboard Shortcuts" in the outline twice. */}
      <DialogTitle sx={{ fontWeight: 'bold' }}>
        {t('keybinding.helpTitle')}
      </DialogTitle>

      <DialogContent onKeyDown={handleKeyDown}>
        {/* What the last shortcut change came to, or the prompt to press one.
            Re-mounted on every status so a refusal met twice is said twice:
            a live region announces the mutation, not the text. Polite, so it
            does not cut off the button whose press caused it. */}
        <Typography
          key={statusRevision}
          role="status"
          aria-live="polite"
          variant="body2"
          sx={{ minHeight: '1.5em', mb: 1 }}
        >
          {status}
        </Typography>

        {anyCustom && (
          <Button
            size="small"
            variant="outlined"
            sx={{ mb: 1 }}
            onClick={() => {
              setRecording(null);
              viewModel.resetAllBindings();
            }}
          >
            {t('keybinding.helpResetAllButton')}
          </Button>
        )}

        <Grid container spacing={1}>
          {items.map((item, index) => (
            <React.Fragment key={item.commandKey ?? `${index}-${item.key}`}>
              <Grid size={12}>
                <HelpRow
                  item={item}
                  recording={recording?.commandKey !== undefined && recording.commandKey === item.commandKey}
                  onChange={startRecording}
                  onReset={resetOne}
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
              {t('keybinding.helpCloseButton')}
            </Button>
          </Grid>
        </Grid>
      </Grid>
    </Dialog>
  );
};

export default Help;
