import type { HelpMenuItem } from '@type/help';
import { Button, Divider, Grid, Typography } from '@mui/material';
import { useLocale } from '@state/hook/useLocale';
import { useViewModel } from '@state/hook/useViewModel';
import { groupBySection, HELP_SECTION_TITLES } from '@type/help';
import { comboFromKeyboardEvent } from '@util/keyCombo';
import React, { useCallback, useId, useMemo, useState } from 'react';

/** Keys that are half of a chord: a recording waits through them. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

type Overrides = Readonly<Record<string, string>>;

interface ShortcutRowProps {
  item: HelpMenuItem;
  /** Whether this row is waiting for the reader to press its new shortcut. */
  recording: boolean;
  onChange: (item: HelpMenuItem) => void;
  onReset: (item: HelpMenuItem) => void;
}

/**
 * One shortcut: what it does, what to press, and the buttons that change it
 * or put the default back.
 *
 * The buttons carry the action's name in their accessible name, because a
 * column of buttons all called "Change" tells a screen reader user nothing
 * about which shortcut each one changes.
 */
const ShortcutRow: React.FC<ShortcutRowProps> = ({ item, recording, onChange, onReset }) => {
  const { t } = useLocale();
  const keyText = recording
    ? t('keybinding.helpRecordingHint')
    : item.isCustom && item.defaultKey !== undefined
      ? t('keybinding.helpCustomKey', { key: item.key, defaultKey: item.defaultKey })
      : item.key;

  return (
    <Grid container spacing={1} alignItems="center" sx={{ py: 1 }}>
      <Grid size={{ xs: 12, sm: 5 }}>
        <Typography variant="body2">{item.description}</Typography>
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <Typography variant="body2" fontWeight={300}>{keyText}</Typography>
      </Grid>
      <Grid size={{ xs: 12, sm: 3 }} container spacing={1} justifyContent="flex-end">
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
        {item.isCustom && (
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

interface ShortcutSettingsProps {
  /** The shortcuts as the dialog's unsaved edits have them. */
  overrides: Overrides;
  /** Takes a change into the dialog's edits; Save keeps it, Cancel drops it. */
  onOverridesChange: (overrides: Overrides) => void;
  /**
   * Told when a recording starts and ends, so the dialog can leave Escape
   * to the recording -- where it means "keep the old shortcut" -- instead
   * of closing on it.
   */
  onRecordingChange: (recording: boolean) => void;
}

/**
 * The Keyboard Shortcuts tab of the settings dialog: every shortcut a reader
 * may change (#189), grouped as the help menu groups them.
 *
 * A change is one of the dialog's unsaved edits, like any other setting:
 * Save keeps it, and Cancel or Escape takes it back.
 * @param props - The panel's configuration.
 * @param props.overrides - The shortcuts as the dialog's edits have them.
 * @param props.onOverridesChange - Takes a change into the dialog's edits.
 * @param props.onRecordingChange - Told when a recording starts and ends.
 * @returns The shortcut list with its controls.
 */
const ShortcutSettings: React.FC<ShortcutSettingsProps> = ({
  overrides,
  onOverridesChange,
  onRecordingChange,
}) => {
  const id = useId();
  const { t } = useLocale();
  const viewModel = useViewModel('settings');
  const items = useMemo(() => viewModel.shortcuts(overrides), [viewModel, overrides]);

  // The row whose new shortcut the reader is about to press. Local: it is
  // input in flight, and it ends with the keydown that settles it.
  const [recording, setRecordingState] = useState<HelpMenuItem | null>(null);
  // What the last change came to. The revision re-mounts the live region
  // so a refusal met twice is said twice: a live region announces the
  // mutation, not the text.
  const [status, setStatus] = useState({ message: '', revision: 0 });

  const announce = useCallback((message: string): void => {
    setStatus(previous => ({ message, revision: previous.revision + 1 }));
  }, []);

  const setRecording = useCallback((item: HelpMenuItem | null): void => {
    setRecordingState(item);
    onRecordingChange(item !== null);
  }, [onRecordingChange]);

  const apply = useCallback((result: { changed: boolean; message: string; overrides: Overrides }): void => {
    if (result.changed) {
      onOverridesChange(result.overrides);
    }
    announce(result.message);
  }, [announce, onOverridesChange]);

  const startRecording = useCallback((item: HelpMenuItem): void => {
    setRecording(item);
    announce(t('keybinding.helpRecordingPrompt', { action: item.description }));
  }, [announce, setRecording, t]);

  const resetOne = useCallback((item: HelpMenuItem): void => {
    if (item.commandKey !== undefined) {
      setRecording(null);
      apply(viewModel.resetShortcut(item.commandKey, overrides));
    }
  }, [apply, overrides, setRecording, viewModel]);

  /**
   * The keydown that settles a recording.
   *
   * Stopped before it leaves the panel: hotkeys-js listens on the document,
   * and the whole point is that the key pressed here binds rather than runs;
   * and the dialog saves on Alt+S and closes on Escape, when Escape here
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
      announce(t('keybinding.helpRecordingCancelled'));
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    if (MODIFIER_KEYS.has(native.key)) {
      return;
    }
    if (native.key === 'Escape') {
      setRecording(null);
      announce(t('keybinding.helpRecordingCancelled'));
      return;
    }
    const plain = !native.ctrlKey && !native.metaKey && !native.altKey && !native.shiftKey;
    if (native.key === 'Backspace' && plain) {
      setRecording(null);
      apply(viewModel.resetShortcut(recording.commandKey, overrides));
      return;
    }
    const combo = comboFromKeyboardEvent(native);
    if (combo === null) {
      announce(t('keybinding.helpUnsupportedKey'));
      return;
    }
    setRecording(null);
    apply(viewModel.rebindShortcut(recording.commandKey, combo, overrides));
  };

  /**
   * Ends a recording that focus has left -- a click on another tab, say --
   * so Escape goes back to closing the dialog rather than waiting on a row
   * the reader can no longer see.
   */
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    const next = event.relatedTarget;
    if (recording !== null && !(next instanceof Node && event.currentTarget.contains(next))) {
      setRecording(null);
    }
  };

  const groups = groupBySection(items);
  const anyCustom = items.some(item => item.isCustom);

  return (
    <Grid size={12} onKeyDown={handleKeyDown} onBlur={handleBlur} className="settings-shortcuts">
      <Typography
        key={status.revision}
        role="status"
        aria-live="polite"
        variant="body2"
        sx={{ minHeight: '1.5em', mb: 1 }}
      >
        {status.message}
      </Typography>

      {anyCustom && (
        <Button
          size="small"
          variant="outlined"
          sx={{ mb: 1 }}
          onClick={() => {
            setRecording(null);
            apply(viewModel.resetAllShortcuts(overrides));
          }}
        >
          {t('keybinding.helpResetAllButton')}
        </Button>
      )}

      {groups.map(group => (
        // A named group rather than a heading: the dialog title is the
        // settings dialog's only heading, each tab naming its own panel.
        <div key={group.section} role="group" aria-labelledby={`${id}-${group.section}`}>
          <Typography
            id={`${id}-${group.section}`}
            component="div"
            variant="subtitle2"
            sx={{ fontWeight: 'bold', mt: 2 }}
          >
            {t(HELP_SECTION_TITLES[group.section])}
          </Typography>
          {group.items.map((item, index) => (
            <React.Fragment key={item.commandKey}>
              <ShortcutRow
                item={item}
                recording={recording?.commandKey === item.commandKey}
                onChange={startRecording}
                onReset={resetOne}
              />
              {index !== group.items.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </div>
      ))}
    </Grid>
  );
};

export default ShortcutSettings;
