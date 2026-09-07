import type { SelectChangeEvent } from '@mui/material';
import type { DotPadState, DotPadTransport } from '@type/dotPad';
import type { Llm, LlmVersion } from '@type/llm';
import type {
  AriaMode,
  BrailleDisplayKind,
  BrailleDisplayPreset,
  GeneralSettings,
  HoverMode,
  LlmModelSettings,
  LlmSettings,
  SettingsSection,
} from '@type/settings';
import { Check as CheckIcon, Error as ErrorIcon } from '@mui/icons-material';
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  InputAdornment,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Slider,
  Switch,
  Tab,
  Tabs,
  TextareaAutosize,
  TextField,
  Typography,
} from '@mui/material';
import { getValidVersion, MODEL_VERSIONS } from '@service/modelVersions';
import { useCredentialProbe } from '@state/hook/useCredentialProbe';
import { useModalContainer } from '@state/hook/useModalContainer';
import { useViewModel } from '@state/hook/useViewModel';
import {
  clampEchoCount,
  clampEchoDuration,
  clampFrequencyRange,
  DEFAULT_SETTINGS_SECTION,
  MAX_BRAILLE_LINES,
  MAX_BRAILLE_SIZE,
  MAX_ECHO_COUNT,
  MAX_FREQUENCY_HZ,
  MIN_FREQUENCY_HZ,
} from '@type/settings';
import { visuallyHidden } from '@ui/visuallyHidden';
import {
  clampBrailleLines,
  clampBrailleSize,
  formatMultiLinePreset,
  formatSingleLinePreset,
  isBrailleDisplayKind,
  MULTI_LINE_BRAILLE_PRESETS,
  parseManualBrailleInput,
  selectBrailleDisplayKind,
  selectBraillePreset,
  SINGLE_LINE_BRAILLE_PRESETS,
} from '@util/braillePreset';
import { copyToClipboard } from '@util/clipboard';
import {
  collectDiagnostics,
  describeMaidrSource,
  formatDiagnostics,
  redactScriptUrl,
} from '@util/diagnostics';
import { resolveVersionOptions } from '@util/llm';
import { formatTactilePreset, isTactileDisplayId, TACTILE_DISPLAY_PRESETS } from '@util/tactilePreset';
import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';

const MIN_CUSTOM_INSTRUCTION_LENGTH = 10;

type CopyStatus = 'idle' | 'copied' | 'failed';

const COPY_STATUS_MESSAGE: Record<CopyStatus, string> = {
  idle: '',
  copied: 'Copied to clipboard',
  failed: 'Could not copy — select the values above and copy them manually',
};

interface CopyState {
  readonly status: CopyStatus;
  /**
   * Counts attempts so a repeat copy still reaches the user. Setting the same
   * status twice changes no text, and unchanged text is no DOM mutation — a
   * live region announces on the mutation, not on the state update, so without
   * this a second successful copy would be silent to a screen reader.
   */
  readonly attempt: number;
}

// Letter portion of the dialog accelerator keys. Shared between the
// keydown handler and the aria-keyshortcuts attributes so the two
// cannot drift apart and announce a shortcut that no longer fires.
const SAVE_SHORTCUT_KEY = 's';
const CANCEL_SHORTCUT_KEY = 'c';

interface SettingsTab {
  readonly id: SettingsSection;
  readonly label: string;
}

/**
 * The dialog's pages, in the order they are offered.
 *
 * The groups are the modality a setting reaches the reader through — what a
 * reader looking for a setting knows about it — rather than the service that
 * happens to own it. The ids are shared (`SettingsSection`) so a caller can
 * ask for a page; the labels are the view's own.
 */
const SETTINGS_TABS: readonly SettingsTab[] = [
  { id: 'general', label: 'General' },
  { id: 'audio', label: 'Audio' },
  { id: 'visual', label: 'Visual' },
  { id: 'braille', label: 'Braille & Tactile' },
  { id: 'ai', label: 'AI' },
  { id: 'about', label: 'About' },
];

// Keeps a tab's badge on the same baseline as its text.
const TAB_LABEL_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

interface SettingsTabPanelProps {
  readonly tabId: SettingsSection;
  readonly activeTabId: SettingsSection;
  /** Whether this tab has been opened at least once this session. */
  readonly visited: boolean;
  /** The dialog's `useId` prefix, so panel and tab ids pair up. */
  readonly dialogId: string;
  readonly children: React.ReactNode;
}

/**
 * The rows of one settings tab.
 *
 * Mounted on first visit and kept from then on, rather than either mounting
 * all six up front or unmounting on every switch. Both halves matter:
 *
 * - Not mounting an unvisited panel is what keeps the API-key probes in the
 *   AI panel from reaching a provider for a reader who never opens it.
 * - Keeping a visited one is what stops a *second* visit from costing
 *   anything. `useCredentialProbe` keys its result to the hook instance, so
 *   remounting resets it to "unknown" — which re-sends the key and, worse,
 *   disables the model dropdown the reader had already been given, with no
 *   action on their part. Live regions have the same problem in a milder
 *   form: a region that unmounts cannot announce what happens while it is
 *   gone, which is how a tactile display disconnecting on another tab would
 *   have gone unannounced.
 *
 * A kept panel is hidden with `display: none`, which takes it out of the
 * accessibility tree and the tab order. The `hidden` attribute would not do:
 * `Grid` sets `display: flex` as an author style, which outranks the user
 * agent's rule for `[hidden]`.
 *
 * @param props - The panel's configuration.
 * @param props.tabId - The tab this panel belongs to.
 * @param props.activeTabId - The tab currently selected in the dialog.
 * @param props.visited - Whether this tab has been opened at least once.
 * @param props.dialogId - The dialog's `useId` prefix.
 * @param props.children - The setting rows to render.
 * @returns The panel once its tab has been opened, otherwise nothing.
 */
const SettingsTabPanel: React.FC<SettingsTabPanelProps> = ({
  tabId,
  activeTabId,
  visited,
  dialogId,
  children,
}) => {
  if (!visited) {
    return null;
  }
  const isActive = tabId === activeTabId;
  return (
    <Grid
      container
      spacing={0.5}
      role="tabpanel"
      // Focusable so that entering the panel announces its name. That name is
      // the only thing left saying which section the reader is in, now that
      // the section headings are gone, and About needs it for a second
      // reason: its first four rows are static text, so tabbing past the
      // panel itself would land on the copy button and skip them.
      tabIndex={0}
      id={`${dialogId}-panel-${tabId}`}
      aria-labelledby={`${dialogId}-tab-${tabId}`}
      sx={isActive ? undefined : { display: 'none' }}
      className={`settings-tab-panel settings-tab-panel-${tabId}`}
    >
      {children}
    </Grid>
  );
};

interface SettingRowProps {
  label: string;
  input: React.ReactNode;
  alignLabel?: 'center' | 'flex-start';
  // When set, the visible label gets this id so the input can use
  // aria-labelledby instead of aria-label, avoiding duplicate
  // announcement of the same text by screen readers.
  labelId?: string;
}

/**
 * Describes the tactile display connection for the settings live region.
 *
 * Every branch says what the reader can do next, because "failed" on its own
 * leaves them with no way to tell a dismissed picker from a browser that cannot
 * reach Bluetooth at all.
 *
 * @param state - The current connection state
 */
function describeTactileState(state: DotPadState): string {
  switch (state.status) {
    case 'connected': {
      const over = state.transport === 'serial' ? 'over USB' : 'over Bluetooth';
      return `Connected to ${state.deviceName ?? 'a tactile display'} ${over}. Press b on the chart to show it.`;
    }
    case 'connecting':
      return 'Connecting…';
    case 'unavailable':
      return state.message;
    case 'failed':
      return `${state.message} Select the device again to retry.`;
    default:
      return state.message === ''
        ? 'Not connected.'
        : state.message;
  }
}

const SettingRow: React.FC<SettingRowProps> = ({ label, input, alignLabel = 'center', labelId }) => (
  <Grid container spacing={1} alignItems={alignLabel} className="settings-grid-container" sx={{ py: 1 }}>
    <Grid size={{ xs: 12, sm: 6, md: 4 }} sx={alignLabel === 'flex-start' ? { py: 1 } : undefined}>
      <Typography id={labelId} variant="body2" fontWeight="normal">
        {label}
      </Typography>
    </Grid>
    <Grid size={{ xs: 12, sm: 6, md: 8 }}>{input}</Grid>
  </Grid>
);

interface BraillePresetSelectProps {
  rowLabel: string;
  placeholder: string;
  presets: readonly BrailleDisplayPreset[];
  selectedPresetId: string | null;
  formatPreset: (preset: BrailleDisplayPreset) => string;
  onPresetChange: (presetId: string) => void;
  hint?: string;
}

const BraillePresetSelect: React.FC<BraillePresetSelectProps> = ({
  rowLabel,
  placeholder,
  presets,
  selectedPresetId,
  formatPreset,
  onPresetChange,
  hint,
}) => {
  const labelId = useId();
  const hintId = useId();
  const { modalRef, container } = useModalContainer();
  return (
    <SettingRow
      label={rowLabel}
      labelId={labelId}
      input={(
        <FormControl fullWidth>
          <Select
            value={selectedPresetId ?? ''}
            onChange={e => onPresetChange(e.target.value)}
            fullWidth
            size="small"
            displayEmpty
            slotProps={{
              input: {
                'aria-labelledby': labelId,
                'aria-required': true,
                ...(hint ? { 'aria-describedby': hintId } : {}),
              },
            }}
            MenuProps={{ disablePortal: true, ref: modalRef, container }}
          >
            <MenuItem value="" disabled>
              {placeholder}
            </MenuItem>
            {presets.map(preset => (
              <MenuItem key={preset.id} value={preset.id}>
                {formatPreset(preset)}
              </MenuItem>
            ))}
          </Select>
          {hint && (
            <Typography
              id={hintId}
              variant="caption"
              sx={{ mt: 0.5, color: 'text.secondary' }}
            >
              {hint}
            </Typography>
          )}
        </FormControl>
      )}
    />
  );
};

interface LlmModelSettingRowProps {
  modelKey: Llm;
  modelSettings: LlmModelSettings;
  onToggle: (key: Llm, enabled: boolean) => void;
  onChangeKey: (key: Llm, value: string) => void;
  onChangeVersion: (key: Llm, value: LlmVersion) => void;
}

const LlmModelSettingRow: React.FC<LlmModelSettingRowProps> = ({
  modelKey,
  modelSettings,
  onToggle,
  onChangeKey,
  onChangeVersion,
}) => {
  const validVersion = getValidVersion(modelKey, modelSettings.version);
  const { modalRef, container } = useModalContainer();
  // The probe is a network side effect, so it belongs to the state layer
  // rather than to this component; `useCredentialProbe` owns the debounce and
  // the staleness handling that go with it.
  const {
    isValidating,
    isValid,
    error: probeError,
    models: availableModels,
  } = useCredentialProbe(modelKey, modelSettings.apiKey, modelSettings.enabled);

  // Ollama is a local server: the credential field holds its base URL and
  // "validation" means reachability, so most labels differ from the cloud
  // providers' API-key wording.
  const isOllama = modelKey === 'OLLAMA';
  const credentialLabel = isOllama ? 'Server URL' : 'API Key';

  const getHelperText = (): string => {
    if (!modelSettings.enabled)
      return '';
    if (isValidating)
      return isOllama ? 'Checking Ollama server...' : 'Validating API key...';
    if (isValid === false) {
      if (probeError) {
        return probeError;
      }
      return isOllama
        ? 'Ollama server is unreachable. Make sure Ollama is running and, for non-localhost pages, that OLLAMA_ORIGINS allows this site.'
        : `${modelSettings.name} API key is invalid`;
    }
    if (isValid === true)
      return isOllama ? 'Ollama server is reachable' : `${modelSettings.name} API key is valid`;
    return '';
  };

  // What the status region announces. The helper text beside the field is
  // decoration by comparison: this region is what the field's
  // `aria-describedby` points at, so it carries the same reason.
  const getStatusLabel = (): string => {
    if (isValidating)
      return isOllama ? 'Checking Ollama server' : 'Validating API key';
    if (isValid === true)
      return isOllama ? 'Ollama server is reachable' : 'API key is valid';
    if (isValid === false)
      return probeError ?? (isOllama ? 'Ollama server is unreachable' : 'API key is invalid');
    return '';
  };

  const renderMenuItems = (): React.ReactNode[] => {
    const config = MODEL_VERSIONS[modelKey];
    const options: readonly string[] = resolveVersionOptions(
      config.options,
      availableModels,
      validVersion,
    );
    return options.map((version) => {
      const label = config.labels[version as keyof typeof config.labels] ?? version;
      const isSelected = modelSettings.version === version;
      return (
        <MenuItem
          key={version}
          value={version}
          className={`llm-model-setting-row-menu-item ${isSelected ? 'selected' : ''}`}
        >
          {isSelected && (
            <CheckIcon className="llm-model-setting-row-check-icon" />
          )}
          {label}
        </MenuItem>
      );
    });
  };

  return (
    <SettingRow
      label={modelSettings.name}
      input={(
        <Grid container spacing={1} alignItems="center">
          <Grid>
            <Switch
              checked={modelSettings.enabled}
              onChange={e => onToggle(modelKey, e.target.checked)}
              slotProps={{
                input: { 'aria-label': `Enable ${modelSettings.name}` },
              }}
            />
          </Grid>
          <Grid size={7}>
            <FormControl fullWidth>
              <TextField
                disabled={!modelSettings.enabled}
                fullWidth
                size="small"
                value={modelSettings.apiKey}
                onChange={e => onChangeKey(modelKey, e.target.value)}
                placeholder={
                  isOllama
                    ? 'Enter Ollama server URL (e.g. http://localhost:11434)'
                    : `Enter ${modelSettings.name} API Key`
                }
                type={isOllama ? 'text' : 'password'}
                error={isValid === false}
                helperText={getHelperText()}
                slotProps={{
                  input: {
                    'aria-label': `${modelSettings.name} ${credentialLabel}`,
                    'aria-describedby': `${modelKey}-status`,
                    'endAdornment': (
                      <InputAdornment position="end">
                        <div
                          id={`${modelKey}-status`}
                          role="status"
                          aria-live="polite"
                          aria-label={getStatusLabel()}
                        >
                          {isValidating
                            ? (
                                <CircularProgress size={20} />
                              )
                            : isValid === true
                              ? (
                                  <CheckIcon color="success" />
                                )
                              : isValid === false
                                ? (
                                    <ErrorIcon color="error" />
                                  )
                                : null}
                        </div>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </FormControl>
          </Grid>
          <Grid size={8}>
            <FormControl fullWidth>
              <Select
                value={validVersion}
                onChange={(e) => {
                  const newVersion = e.target.value as LlmVersion;
                  onChangeVersion(modelKey, newVersion);
                }}
                disabled={
                  !modelSettings.enabled
                  || !modelSettings.apiKey.trim()
                  || !isValid
                }
                fullWidth
                size="small"
                slotProps={{
                  input: {
                    'aria-label': `${modelSettings.name} Model Version`,
                  },
                }}
                MenuProps={{
                  disablePortal: true,
                  ref: modalRef,
                  container,
                  PaperProps: {
                    className: 'settings-menu-paper',
                  },
                }}
              >
                {renderMenuItems()}
              </Select>
              {isValid === true
                && availableModels.length > 0
                && !availableModels.includes(validVersion) && (
                <Typography
                  variant="caption"
                  color="warning.main"
                  role="status"
                  sx={{ mt: 0.5 }}
                >
                  {`"${validVersion}" is not in ${modelSettings.name}'s current model list — it may have been retired. Consider selecting another model.`}
                </Typography>
              )}
            </FormControl>
          </Grid>
        </Grid>
      )}
    />
  );
};

const Settings: React.FC = () => {
  const id = useId();
  const viewModel = useViewModel('settings');
  const chatViewModel = useViewModel('chat');
  const dialog = useModalContainer();
  const expertiseMenu = useModalContainer();
  const { general, llm } = viewModel.state;

  // SettingsService normalizes braille display fields at construction
  // before any consumer reads them, so the component-side state already
  // arrives in a coherent shape and does not need to re-normalize here.
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(general);
  const [llmSettings, setLlmSettings] = useState<LlmSettings>(llm);

  // Seeded from the opener so a caller that sends the reader here for one
  // setting lands them on it. Read once, as the dialog mounts: it is closed
  // by unmounting, so every open runs this initialiser afresh.
  const [activeTab, setActiveTab] = useState<SettingsSection>(
    () => viewModel.initialSection ?? DEFAULT_SETTINGS_SECTION,
  );
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<SettingsSection>>(
    () => new Set([viewModel.initialSection ?? DEFAULT_SETTINGS_SECTION]),
  );
  const [copyState, setCopyState] = useState<CopyState>({ status: 'idle', attempt: 0 });
  // Connection progress lives here rather than in Redux: this dialog reads the
  // view model directly, so a store update would not re-render it. The attempt
  // counter forces the live region to mutate even when two attempts end with
  // the same message, which is what makes the second one announce.
  const [tactileState, setTactileState] = useState<DotPadState>(
    () => viewModel.tactileDisplayState,
  );
  const [tactileAttempt, setTactileAttempt] = useState(0);
  const titleId = `${id}-title`;
  const copyStatusId = `${id}-copy-status`;
  const tactileLabelId = `${id}-tactile-label`;
  const tactileStatusId = `${id}-tactile-status`;
  const saveBlockedId = `${id}-save-blocked`;
  const customInstructionStatusId = `${id}-custom-instruction-status`;
  const tactileMenu = useModalContainer();
  const contentRef = React.useRef<HTMLDivElement>(null);
  // `HTMLDivElement` because that is what MUI declares `Tab`'s ref as, even
  // though it renders a `<button>`. Only `focus()` is called on it, which
  // every element has.
  const aiTabRef = React.useRef<HTMLDivElement>(null);
  // Counts refused saves rather than holding a boolean, so a second refusal
  // re-runs the effect below instead of looking like the first one.
  const [refusedSaves, setRefusedSaves] = useState(0);
  // The bundle source and the browser cannot change while the dialog is open,
  // so the DOM scan behind this runs once per mount rather than per render.
  const diagnostics = useMemo(() => collectDiagnostics(), []);
  // Displayed with the same redaction the copied block uses: a screenshot of
  // this dialog is handed to a maintainer just as readily as the pasted text,
  // so both have to drop the OS username and any signed-URL token.
  const sourceUrl = useMemo(
    () => (diagnostics.source.url ? redactScriptUrl(diagnostics.source.url) : null),
    [diagnostics],
  );

  const handleCopyDiagnostics = useCallback(async (): Promise<void> => {
    let status: CopyStatus;
    try {
      await copyToClipboard(formatDiagnostics(diagnostics));
      status = 'copied';
    } catch (error) {
      console.error('[Settings] Failed to copy diagnostics', error);
      status = 'failed';
    }
    // Always a fresh object, so an unchanged status still re-renders.
    setCopyState(prev => ({ status, attempt: prev.attempt + 1 }));
  }, [diagnostics]);

  useEffect(() => {
    viewModel.load();
  }, [viewModel]);

  useEffect(() => {
    const subscription = viewModel.onTactileDisplayStateChange((state) => {
      setTactileState(state);
      setTactileAttempt(previous => previous + 1);
    });
    return () => subscription.dispose();
  }, [viewModel]);

  // Fetch the SDK ahead of the connect click. The browser only opens a device
  // picker while the click's activation is still live, and awaiting a cold
  // network fetch first spends it.
  //
  // But not for everyone who opens this dialog: the SDK is third-party code
  // fetched from a CDN, and most readers have no tactile display. It is
  // fetched here for a reader who has already chosen one, and otherwise the
  // moment they reach the tactile controls -- which is always before they
  // press a button in them.
  const preloadTactile = useCallback((): void => {
    viewModel.preloadTactileDisplay();
  }, [viewModel]);
  useEffect(() => {
    if (isTactileDisplayId(general.tactileDisplayDeviceId)) {
      preloadTactile();
    }
  }, [general.tactileDisplayDeviceId, preloadTactile]);

  useEffect(() => {
    setGeneralSettings(general);
    setLlmSettings(llm);
  }, [general, llm]);

  // Selecting the AI tab is not, on its own, something a reader can perceive.
  // Its panel is already mounted by the time a save is refused — that is where
  // the instruction was typed — so switching to it mutates no live region and
  // announces nothing. Moving focus is what makes the refusal perceivable, and
  // the tab it lands on is named "AI needs attention".
  //
  // In an effect rather than in the key handler so that focus arrives after
  // the render that marks the tab selected; focusing first would announce the
  // tab as unselected.
  useEffect(() => {
    if (refusedSaves === 0) {
      return;
    }
    aiTabRef.current?.focus();
  }, [refusedSaves]);

  const handleGeneralChange = <K extends keyof GeneralSettings>(
    key: K,
    value: GeneralSettings[K],
  ): void => {
    setGeneralSettings(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  // Called straight from the click or the select's change, never after an
  // await: the browser only opens the Bluetooth picker while the user's gesture
  // is still in progress.
  const handleTactileConnect = useCallback((transport: DotPadTransport): void => {
    void viewModel.connectTactileDisplay(transport);
  }, [viewModel]);

  const handleTactileDeviceChange = useCallback((deviceId: string): void => {
    setGeneralSettings(prev => ({ ...prev, tactileDisplayDeviceId: deviceId }));
    // Picking a device is itself the gesture, so the picker can open straight
    // from it. Bluetooth is the attempt made here because it is the transport
    // every supported platform has; a reader on a cable takes the USB button
    // beside it, which is one click either way.
    handleTactileConnect('bluetooth');
  }, [handleTactileConnect]);

  const handleBrailleKindChange = useCallback((kind: BrailleDisplayKind): void => {
    setGeneralSettings((prev) => {
      const slice = selectBrailleDisplayKind(kind, prev.brailleDisplayPresetId);
      return { ...prev, ...slice };
    });
  }, []);

  const handleBraillePresetChange = useCallback(
    (kind: 'single' | 'multi', presetId: string): void => {
      const slice = selectBraillePreset(kind, presetId);
      if (!slice) {
        return;
      }
      setGeneralSettings(prev => ({ ...prev, ...slice }));
    },
    [],
  );

  const handleSingleLinePresetChange = useCallback(
    (presetId: string) => handleBraillePresetChange('single', presetId),
    [handleBraillePresetChange],
  );

  const handleMultiLinePresetChange = useCallback(
    (presetId: string) => handleBraillePresetChange('multi', presetId),
    [handleBraillePresetChange],
  );

  const handleLlmChange = <K extends keyof LlmSettings>(
    key: K,
    value: LlmSettings[K],
  ): void => {
    setLlmSettings(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleLlmModelChange = (
    modelKey: Llm,
    propKey: keyof LlmModelSettings,
    value: string | boolean | LlmVersion,
  ): void => {
    setLlmSettings(prev => ({
      ...prev,
      models: {
        ...prev.models,
        [modelKey]: {
          ...prev.models[modelKey],
          [propKey]:
            propKey === 'apiKey' && typeof value === 'string'
              ? value.trim()
              : value,
        },
      },
    }));
  };

  const handleReset = (): void => {
    viewModel.reset();
    const { general, llm } = viewModel.state;
    setGeneralSettings(general);
    setLlmSettings(llm);
  };

  // The second parameter is MUI's `any`. Narrowing it here is sound because
  // the only values that reach it are the `Tab` values, which come from
  // `SETTINGS_TABS`.
  const handleTabChange = useCallback(
    (_event: React.SyntheticEvent, tabId: SettingsSection): void => {
      setActiveTab(tabId);
      setVisitedTabs(previous =>
        previous.has(tabId) ? previous : new Set(previous).add(tabId));
      // The panels share one scroll container, so a switch would otherwise
      // open the next page part-way down — a lost place for a reader using
      // magnification.
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }
      // "Copied to clipboard" belongs to a copy that has now scrolled out of
      // the conversation. Left alone it reappears on the next visit to About
      // as though it had just happened.
      setCopyState(previous =>
        previous.status === 'idle' ? previous : { status: 'idle', attempt: previous.attempt });
    },
    [],
  );

  const handleClose = useCallback((): void => {
    viewModel.toggle();
  }, [viewModel]);

  // MUI's Modal calls stopPropagation() on the Escape keydown before it can
  // reach the document-level hotkeys-js listener, so the SETTINGS scope keymap
  // never sees the key — Escape has to be handled by the dialog itself.
  // Only `escapeKeyDown` closes: a backdrop click stays inert so a stray click
  // outside the dialog cannot discard unsaved edits.
  const handleDialogClose = useCallback(
    (_event: object, reason: 'backdropClick' | 'escapeKeyDown'): void => {
      if (reason === 'escapeKeyDown') {
        handleClose();
      }
    },
    [handleClose],
  );

  const handleSave = useCallback((): void => {
    // Clamp before persisting so a Save click before the field blurs
    // can't bypass the [1, MAX] bound. The onChange path intentionally
    // skips range clamping during typing so users can edit through
    // intermediate out-of-range states; this is the commit point.
    const safeGeneral: GeneralSettings = {
      ...generalSettings,
      brailleDisplaySize: clampBrailleSize(generalSettings.brailleDisplaySize),
      brailleDisplayLines: clampBrailleLines(generalSettings.brailleDisplayLines),
      // The echo count field is free-typed, so its min/max inputProps are a
      // hint rather than a limit; persist a value the audio service can use.
      echoCount: clampEchoCount(generalSettings.echoCount),
      echoDuration: clampEchoDuration(generalSettings.echoDuration),
      // Both frequency fields are free-typed too, and AudioService maps every
      // point into this range without a clamp of its own — a cleared field
      // (which reads back as 0) or an inverted range would leave the chart
      // silent or its pitch running backwards until Reset.
      ...clampFrequencyRange(generalSettings.minFrequency, generalSettings.maxFrequency),
    };
    viewModel.saveAndClose({ general: safeGeneral, llm: llmSettings });
    // Update the welcome bubble's model info in place instead of resetting the
    // chat slice, so saving a setting (e.g. volume) never discards an ongoing
    // conversation.
    chatViewModel.updateWelcomeMessage();
  }, [viewModel, chatViewModel, generalSettings, llmSettings]);

  const handleSelectClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleSelectChange = useCallback(
    (
      e: SelectChangeEvent<'basic' | 'intermediate' | 'advanced' | 'custom'>,
    ) => {
      e.stopPropagation();
      handleLlmChange('expertiseLevel', e.target.value);
    },
    [handleLlmChange],
  );

  const isCustomInstructionValid
    = llmSettings.expertiseLevel !== 'custom'
      || llmSettings.customInstruction.length >= MIN_CUSTOM_INSTRUCTION_LENGTH;

  /**
   * Answers a save that cannot go through.
   *
   * Doing nothing would leave a reader with no response at all — no sound, no
   * text, nothing saying why. Opening the tab that holds the field is the
   * answer to "why not", and puts them where the fix is; the effect above
   * then moves focus there, which is the part they can actually perceive.
   */
  const refuseSave = useCallback((): void => {
    setActiveTab('ai');
    setVisitedTabs(previous =>
      previous.has('ai') ? previous : new Set(previous).add('ai'));
    setRefusedSaves(previous => previous + 1);
  }, []);

  // The single entry point for "the reader asked to save", so the button and
  // the shortcut cannot answer a refusal differently.
  const handleSaveRequest = useCallback((): void => {
    if (!isCustomInstructionValid) {
      refuseSave();
      return;
    }
    handleSave();
  }, [isCustomInstructionValid, refuseSave, handleSave]);

  // Dialog-scoped: KeybindingService's hotkeys.filter blocks shortcuts while
  // focus is in a non-MAIDR <input>, which would silently break Alt+s / Alt+c
  // inside the manual cells/lines fields.
  const handleDialogKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      const altOnly = e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
      if (!altOnly) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === SAVE_SHORTCUT_KEY) {
        e.preventDefault();
        handleSaveRequest();
      } else if (key === CANCEL_SHORTCUT_KEY) {
        e.preventDefault();
        handleClose();
      }
    },
    [handleSaveRequest, handleClose],
  );

  return (
    <Dialog
      id={id}
      role="dialog"
      // Names the dialog. `aria-label` cannot do it here: MUI applies
      // `role` and `aria-labelledby` to the paper — the `role="dialog"`
      // element — but spreads everything else, `aria-label` included, onto
      // the modal root, which is `role="presentation"` and names nothing.
      // Passing the id also settles the reference MUI derives from it for
      // `DialogContext`; left to generate its own, it points the paper at a
      // `DialogTitle` that need not exist.
      aria-labelledby={titleId}
      open={true}
      onClose={handleDialogClose}
      maxWidth="sm"
      fullWidth
      disablePortal
      ref={dialog.modalRef}
      container={dialog.container}
      disableEnforceFocus
      onClick={e => e.stopPropagation()}
      onKeyDown={handleDialogKeyDown}
      className="settings-dialog"
    >
      {/* Renders as an `h2`, and it is now the dialog's only heading: each
          panel is named by its own tab, so a heading repeating that name
          would announce the same words twice. */}
      <DialogTitle id={titleId} className="settings-dialog-title">
        Settings
      </DialogTitle>

      {/* The tablist sits outside `DialogContent` so it stays put while a
          panel scrolls; inside it, a long panel would carry the tabs off
          screen and leave no way back to the other sections. */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label="Settings sections"
        className="settings-tabs"
        sx={{
          'px': 3,
          'borderBottom': 1,
          'borderColor': 'divider',
          // `ButtonBase` clears the UA outline, and `Tab` replaces it with
          // nothing. Arrow keys move focus without selecting, so without this
          // a reader arrowing the tablist has no way to see where they are.
          '& .settings-tab.Mui-focusVisible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: '-2px',
          },
          // Selection is otherwise text colour plus the indicator's
          // background, and a forced-colours mode overrides both — leaving
          // six tabs that look alike. A system colour the mode is told not to
          // override keeps the indicator visible.
          '@media (forced-colors: active)': {
            '& .MuiTabs-indicator': {
              backgroundColor: 'Highlight',
              forcedColorAdjust: 'none',
            },
            '& .settings-tab.Mui-focusVisible': {
              outlineColor: 'CanvasText',
            },
          },
        }}
      >
        {SETTINGS_TABS.map(tab => (
          <Tab
            key={tab.id}
            value={tab.id}
            ref={tab.id === 'ai' ? aiTabRef : undefined}
            id={`${id}-tab-${tab.id}`}
            // Named only on the selected tab. A visited tab's panel is in
            // the document, but hidden — so it is out of the accessibility
            // tree, and pointing at it would be no better than pointing at
            // the unvisited ones, which are not there at all.
            aria-controls={
              tab.id === activeTab ? `${id}-panel-${tab.id}` : undefined
            }
            className="settings-tab"
            sx={{ minWidth: 0, px: 1.5, textTransform: 'none' }}
            label={(
              <span className="settings-tab-label" style={TAB_LABEL_STYLE}>
                {tab.label}
                {/* Marks the tab holding the edit that is blocking Save, so
                    the reason is reachable from whichever tab is open. The
                    icon is decorative and the text beside it carries the
                    meaning, because colour and shape alone say nothing to a
                    reader. It extends the visible label rather than
                    replacing it, and it leads with a space: a name computed
                    from an element's contents is the concatenation of them,
                    which would otherwise announce "AIneeds attention". */}
                {tab.id === 'ai' && !isCustomInstructionValid && (
                  <>
                    <ErrorIcon color="error" fontSize="small" aria-hidden="true" />
                    <span style={visuallyHidden}>{' needs attention'}</span>
                  </>
                )}
              </span>
            )}
          />
        ))}
      </Tabs>

      {/* A floor under the shortest panels so switching tabs does not resize
          the dialog under the reader's pointer or magnifier. Only the two
          tallest panels push past it, and the viewport term keeps the floor
          from squeezing the footer off a short screen. */}
      <DialogContent
        ref={contentRef}
        className="settings-dialog-content"
        sx={{ minHeight: 'min(400px, 45vh)' }}
      >
        <SettingsTabPanel
          tabId="general"
          activeTabId={activeTab}
          visited={visitedTabs.has('general')}
          dialogId={id}
        >
          <Grid size={12}>
            <SettingRow
              label="Autoplay Duration (ms)"
              input={(
                <FormControl fullWidth>
                  <TextField
                    fullWidth
                    type="number"
                    size="small"
                    value={generalSettings.autoplayDuration}
                    onChange={e =>
                      handleGeneralChange(
                        'autoplayDuration',
                        Number(e.target.value),
                      )}
                    slotProps={{
                      input: {
                        inputProps: {
                          'aria-label': 'Autoplay Duration',
                        },
                      },
                    }}
                  />
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="ARIA Mode"
              input={(
                <FormControl>
                  <RadioGroup
                    row
                    value={generalSettings.ariaMode}
                    onChange={e =>
                      handleGeneralChange(
                        'ariaMode',
                        e.target.value as AriaMode,
                      )}
                    aria-label="ARIA Mode"
                  >
                    <FormControlLabel
                      value="assertive"
                      control={<Radio size="small" />}
                      label="Assertive"
                    />
                    <FormControlLabel
                      value="polite"
                      control={<Radio size="small" />}
                      label="Polite"
                    />
                  </RadioGroup>
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="Hover Mode"
              input={(
                <FormControl>
                  <RadioGroup
                    row
                    value={generalSettings.hoverMode}
                    onChange={e =>
                      handleGeneralChange(
                        'hoverMode',
                        e.target.value as HoverMode,
                      )}
                    aria-label="Hover Mode"
                  >
                    <FormControlLabel
                      value="off"
                      control={<Radio size="small" />}
                      label="Off"
                    />
                    <FormControlLabel
                      value="pointermove"
                      control={<Radio size="small" />}
                      label="Hover"
                    />
                    <FormControlLabel
                      value="click"
                      control={<Radio size="small" />}
                      label="Click"
                    />
                  </RadioGroup>
                </FormControl>
              )}
            />
          </Grid>
        </SettingsTabPanel>

        <SettingsTabPanel
          tabId="audio"
          activeTabId={activeTab}
          visited={visitedTabs.has('audio')}
          dialogId={id}
        >
          <Grid size={12}>
            <SettingRow
              label="Volume"
              input={(
                <FormControl fullWidth>
                  <Slider
                    value={generalSettings.volume}
                    onChange={(_, value) =>
                      handleGeneralChange('volume', Number(value))}
                    min={0}
                    max={100}
                    step={1}
                    valueLabelDisplay="auto"
                    slotProps={{
                      input: {
                        'aria-valuemin': 0,
                        'aria-valuemax': 100,
                        'aria-label': 'Volume',
                        'aria-labelledby': 'volume-label',
                      },
                    }}
                    className="settings-slider-value-label"
                  />
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="Min Frequency (Hz)"
              input={(
                <FormControl fullWidth>
                  <TextField
                    fullWidth
                    type="number"
                    size="small"
                    value={generalSettings.minFrequency}
                    onChange={e =>
                      handleGeneralChange(
                        'minFrequency',
                        Number(e.target.value),
                      )}
                    slotProps={{
                      input: {
                        inputProps: {
                          'aria-label': 'Minimum Frequency',
                          'min': MIN_FREQUENCY_HZ,
                          'max': MAX_FREQUENCY_HZ,
                        },
                      },
                    }}
                  />
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="Max Frequency (Hz)"
              input={(
                <FormControl fullWidth>
                  <TextField
                    fullWidth
                    type="number"
                    size="small"
                    value={generalSettings.maxFrequency}
                    onChange={e =>
                      handleGeneralChange(
                        'maxFrequency',
                        Number(e.target.value),
                      )}
                    slotProps={{
                      input: {
                        inputProps: {
                          'aria-label': 'Maximum Frequency',
                          'min': MIN_FREQUENCY_HZ,
                          'max': MAX_FREQUENCY_HZ,
                        },
                      },
                    }}
                  />
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="3D Echo Count"
              labelId={`${id}-echo-count-label`}
              input={(
                <FormControl fullWidth>
                  <TextField
                    fullWidth
                    type="number"
                    size="small"
                    value={generalSettings.echoCount}
                    onChange={e =>
                      handleGeneralChange('echoCount', Number(e.target.value))}
                    slotProps={{
                      input: {
                        inputProps: {
                          'min': 0,
                          'max': MAX_ECHO_COUNT,
                          'step': 1,
                          'aria-labelledby': `${id}-echo-count-label`,
                        },
                      },
                    }}
                  />
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="Echo Volume"
              labelId={`${id}-echo-volume-label`}
              input={(
                <FormControl fullWidth>
                  <Slider
                    value={generalSettings.echoVolume}
                    onChange={(_, value) =>
                      handleGeneralChange('echoVolume', Number(value))}
                    min={0}
                    max={100}
                    step={1}
                    valueLabelDisplay="auto"
                    slotProps={{
                      input: {
                        'aria-valuemin': 0,
                        'aria-valuemax': 100,
                        'aria-labelledby': `${id}-echo-volume-label`,
                      },
                    }}
                    className="settings-slider-value-label"
                  />
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="Echo Duration (s)"
              labelId={`${id}-echo-duration-label`}
              input={(
                <FormControl fullWidth>
                  <Slider
                    value={generalSettings.echoDuration}
                    onChange={(_, value) =>
                      handleGeneralChange('echoDuration', Number(value))}
                    min={0.05}
                    max={2}
                    step={0.05}
                    valueLabelDisplay="auto"
                    slotProps={{
                      input: {
                        'aria-valuemin': 0.05,
                        'aria-valuemax': 2,
                        'aria-labelledby': `${id}-echo-duration-label`,
                      },
                    }}
                    className="settings-slider-value-label"
                  />
                </FormControl>
              )}
            />
          </Grid>
        </SettingsTabPanel>

        <SettingsTabPanel
          tabId="visual"
          activeTabId={activeTab}
          visited={visitedTabs.has('visual')}
          dialogId={id}
        >
          <Grid size={12}>
            <SettingRow
              label="Outline Color"
              input={(
                <FormControl fullWidth>
                  <TextField
                    fullWidth
                    type="color"
                    size="small"
                    value={generalSettings.highlightColor}
                    onChange={e =>
                      handleGeneralChange('highlightColor', e.target.value)}
                    slotProps={{
                      input: {
                        inputProps: {
                          'aria-label': 'Highlight Color',
                        },
                      },
                    }}
                  />
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="High Contrast Mode"
              input={(
                <FormControl>
                  <FormControlLabel
                    control={(
                      <Checkbox
                        checked={generalSettings.highContrastMode}
                        onChange={e =>
                          handleGeneralChange('highContrastMode', e.target.checked)}
                        size="small"
                      />
                    )}
                    label={generalSettings.highContrastMode ? 'On' : 'Off'}
                    slotProps={{
                      typography: {
                        variant: 'body2',
                      },
                    }}
                    aria-label="High Contrast Mode"
                  />
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="High Contrast Levels"
              input={(
                <FormControl fullWidth>
                  <TextField
                    fullWidth
                    type="number"
                    size="small"
                    value={generalSettings.highContrastLevels}
                    onChange={e =>
                      handleGeneralChange(
                        'highContrastLevels',
                        Number(e.target.value),
                      )}
                    slotProps={{
                      input: {
                        inputProps: {
                          'aria-label': 'High Contrast Levels',
                          'min': 2,
                          'max': 20,
                        },
                      },
                    }}
                  />
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="High Contrast Light Color"
              input={(
                <FormControl fullWidth>
                  <TextField
                    fullWidth
                    type="color"
                    size="small"
                    value={generalSettings.highContrastLightColor}
                    onChange={e =>
                      handleGeneralChange('highContrastLightColor', e.target.value)}
                    slotProps={{
                      input: {
                        inputProps: {
                          'aria-label': 'High Contrast Light Color',
                        },
                      },
                    }}
                  />
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="High Contrast Dark Color"
              input={(
                <FormControl fullWidth>
                  <TextField
                    fullWidth
                    type="color"
                    size="small"
                    value={generalSettings.highContrastDarkColor}
                    onChange={e =>
                      handleGeneralChange('highContrastDarkColor', e.target.value)}
                    slotProps={{
                      input: {
                        inputProps: {
                          'aria-label': 'High Contrast Dark Color',
                        },
                      },
                    }}
                  />
                </FormControl>
              )}
            />
          </Grid>
        </SettingsTabPanel>

        <SettingsTabPanel
          tabId="braille"
          activeTabId={activeTab}
          visited={visitedTabs.has('braille')}
          dialogId={id}
        >
          <Grid size={12}>
            <SettingRow
              label="Braille Display"
              alignLabel="flex-start"
              labelId={`${id}-braille-kind-label`}
              input={(
                <FormControl fullWidth>
                  <RadioGroup
                    row
                    value={generalSettings.brailleDisplayKind}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (isBrailleDisplayKind(v)) {
                        handleBrailleKindChange(v);
                      }
                    }}
                    aria-labelledby={`${id}-braille-kind-label`}
                  >
                    <FormControlLabel
                      value="single"
                      control={<Radio size="small" />}
                      label="Single line"
                    />
                    <FormControlLabel
                      value="multi"
                      control={<Radio size="small" />}
                      label="Multi-line"
                    />
                    <FormControlLabel
                      value="manual"
                      control={<Radio size="small" />}
                      label="Configure manually"
                    />
                  </RadioGroup>
                </FormControl>
              )}
            />
          </Grid>
          {generalSettings.brailleDisplayKind === 'single' && (
            <Grid size={12}>
              <BraillePresetSelect
                rowLabel="Single-Line Display"
                placeholder="Select a single-line display"
                presets={SINGLE_LINE_BRAILLE_PRESETS}
                selectedPresetId={generalSettings.brailleDisplayPresetId}
                formatPreset={formatSingleLinePreset}
                onPresetChange={handleSingleLinePresetChange}
                hint={'Don\'t see your display? Choose "Configure manually".'}
              />
            </Grid>
          )}
          {generalSettings.brailleDisplayKind === 'multi' && (
            <Grid size={12}>
              <BraillePresetSelect
                rowLabel="Multi-Line Display"
                placeholder="Select a multi-line display"
                presets={MULTI_LINE_BRAILLE_PRESETS}
                selectedPresetId={generalSettings.brailleDisplayPresetId}
                formatPreset={formatMultiLinePreset}
                onPresetChange={handleMultiLinePresetChange}
                hint={'Don\'t see your display? Choose "Configure manually".'}
              />
            </Grid>
          )}
          {generalSettings.brailleDisplayKind === 'manual' && (
            <Grid
              size={12}
              role="group"
              aria-label="Manual braille display configuration"
            >
              <Grid size={12}>
                <SettingRow
                  label="Braille Display Size"
                  input={(
                    <FormControl fullWidth>
                      <TextField
                        fullWidth
                        type="number"
                        size="small"
                        value={generalSettings.brailleDisplaySize}
                        onChange={(e) => {
                          const next = parseManualBrailleInput(e.target.value);
                          if (next !== null) {
                            handleGeneralChange('brailleDisplaySize', next);
                          }
                        }}
                        onBlur={(e) => {
                          const next = parseManualBrailleInput(e.target.value, clampBrailleSize);
                          if (next !== null) {
                            handleGeneralChange('brailleDisplaySize', next);
                          }
                        }}
                        helperText={`Cells per row on a physical braille display (1-${MAX_BRAILLE_SIZE}).`}
                        slotProps={{
                          input: {
                            inputProps: {
                              'aria-label': 'Braille Display Size',
                              'min': 1,
                              'max': MAX_BRAILLE_SIZE,
                              'step': 1,
                            },
                          },
                        }}
                      />
                    </FormControl>
                  )}
                />
              </Grid>
              <Grid size={12}>
                <SettingRow
                  label="Braille Display Lines"
                  input={(
                    <FormControl fullWidth>
                      <TextField
                        fullWidth
                        type="number"
                        size="small"
                        value={generalSettings.brailleDisplayLines}
                        onChange={(e) => {
                          const next = parseManualBrailleInput(e.target.value);
                          if (next !== null) {
                            handleGeneralChange('brailleDisplayLines', next);
                          }
                        }}
                        onBlur={(e) => {
                          const next = parseManualBrailleInput(e.target.value, clampBrailleLines);
                          if (next !== null) {
                            handleGeneralChange('brailleDisplayLines', next);
                          }
                        }}
                        helperText={`Number of rows on a physical braille display (1-${MAX_BRAILLE_LINES}). Set above 1 to enable multi-line output.`}
                        slotProps={{
                          input: {
                            inputProps: {
                              'aria-label': 'Braille Display Lines',
                              'min': 1,
                              'max': MAX_BRAILLE_LINES,
                              'step': 1,
                            },
                          },
                        }}
                      />
                    </FormControl>
                  )}
                />
              </Grid>
            </Grid>
          )}
          <Grid size={12}>
            <SettingRow
              label="Tactile Graphics Display"
              labelId={tactileLabelId}
              alignLabel="flex-start"
              input={(
                <FormControl fullWidth onFocus={preloadTactile} onMouseEnter={preloadTactile}>
                  <Select
                    value={generalSettings.tactileDisplayDeviceId ?? ''}
                    onChange={e => handleTactileDeviceChange(e.target.value)}
                    fullWidth
                    size="small"
                    displayEmpty
                    slotProps={{
                      input: {
                        'aria-labelledby': tactileLabelId,
                        'aria-describedby': tactileStatusId,
                      },
                    }}
                    MenuProps={{
                      disablePortal: true,
                      ref: tactileMenu.modalRef,
                      container: tactileMenu.container,
                    }}
                  >
                    <MenuItem value="" disabled>
                      Select a tactile display
                    </MenuItem>
                    {TACTILE_DISPLAY_PRESETS.map(preset => (
                      <MenuItem key={preset.id} value={preset.id}>
                        {formatTactilePreset(preset)}
                      </MenuItem>
                    ))}
                  </Select>
                  <Grid container spacing={1} sx={{ mt: 1 }} alignItems="center">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleTactileConnect('bluetooth')}
                      disabled={
                        tactileState.status === 'connecting'
                        || !viewModel.supportsTactileTransport('bluetooth')
                      }
                    >
                      Connect over Bluetooth
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleTactileConnect('serial')}
                      disabled={
                        tactileState.status === 'connecting'
                        || !viewModel.supportsTactileTransport('serial')
                      }
                    >
                      Connect over USB
                    </Button>
                    {tactileState.status === 'connected' && (
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => viewModel.disconnectTactileDisplay()}
                      >
                        Disconnect
                      </Button>
                    )}
                    {tactileState.status === 'connecting' && (
                      <CircularProgress size={16} aria-hidden="true" />
                    )}
                  </Grid>
                  <Typography
                    id={tactileStatusId}
                    role="status"
                    aria-live="polite"
                    variant="caption"
                    sx={{ mt: 0.5, color: 'text.secondary', display: 'block' }}
                  >
                    <span key={tactileAttempt}>{describeTactileState(tactileState)}</span>
                  </Typography>
                </FormControl>
              )}
            />
          </Grid>
        </SettingsTabPanel>

        <SettingsTabPanel
          tabId="ai"
          activeTabId={activeTab}
          visited={visitedTabs.has('ai')}
          dialogId={id}
        >
          {(Object.keys(llmSettings.models) as Llm[]).map((modelKey) => {
            const model = llmSettings.models[modelKey];
            return (
              <Grid size={12} key={modelKey} className="settings-model-row">
                <LlmModelSettingRow
                  modelKey={modelKey}
                  modelSettings={model}
                  onToggle={(key, enabled) =>
                    handleLlmModelChange(key, 'enabled', enabled)}
                  onChangeKey={(key, value) =>
                    handleLlmModelChange(key, 'apiKey', value)}
                  onChangeVersion={(key, value) =>
                    handleLlmModelChange(key, 'version', value)}
                />
              </Grid>
            );
          })}

          {/* Expertise Level */}
          <Grid size={12} className="settings-row">
            <FormControl
              fullWidth
              size="small"
              className="settings-model-select"
            >
              <SettingRow
                label="Expertise Level"
                input={(
                  <Select
                    value={llmSettings.expertiseLevel}
                    onChange={handleSelectChange}
                    onClick={handleSelectClick}
                    slotProps={{
                      input: {
                        'aria-label': 'Expertise Level',
                      },
                    }}
                    MenuProps={{
                      disablePortal: true,
                      ref: expertiseMenu.modalRef,
                      container: expertiseMenu.container,
                      PaperProps: {
                        className: 'llm-model-setting-select-menu',
                      },
                    }}
                  >
                    <MenuItem value="basic">Basic</MenuItem>
                    <MenuItem value="intermediate">Intermediate</MenuItem>
                    <MenuItem value="advanced">Advanced</MenuItem>
                    <MenuItem value="custom">Custom</MenuItem>
                  </Select>
                )}
              />
            </FormControl>
          </Grid>

          {/* Custom Instructions - Only show when custom is selected */}
          {llmSettings.expertiseLevel === 'custom' && (
            <Grid size={12}>
              <Grid
                container
                spacing={1}
                alignItems="flex-start"
                sx={{ py: 1 }}
              >
                <Grid size={12} sx={{ py: 1 }}>
                  <Typography variant="body2" fontWeight="normal">
                    Custom Instructions
                  </Typography>
                </Grid>
                <Grid size={12}>
                  <FormControl fullWidth>
                    <TextareaAutosize
                      minRows={3}
                      maxRows={6}
                      value={llmSettings.customInstruction}
                      onChange={e =>
                        handleLlmChange('customInstruction', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                      }}
                      placeholder="Enter custom instruction..."
                      aria-label="Custom Instructions"
                      // The field that blocks Save has to say so itself. A
                      // reader who lands on it hears the requirement as its
                      // description, rather than having to find the warning
                      // sitting underneath.
                      aria-invalid={!isCustomInstructionValid || undefined}
                      aria-describedby={customInstructionStatusId}
                    />
                  </FormControl>
                  {/* Rendered whether or not there is anything to say, and
                      polite rather than assertive. `Alert` defaults to
                      `role="alert"`, which interrupts — too much for a field
                      the reader is in the middle of typing. But simply asking
                      for `role="status"` instead would have traded one fault
                      for a worse one: a status region created already holding
                      its text is routinely not announced at all, while an
                      alert on insertion is. Keeping the region mounted and
                      letting its text change is what makes it both polite and
                      reliably heard. */}
                  <div
                    id={customInstructionStatusId}
                    role="status"
                    aria-live="polite"
                  >
                    {llmSettings.customInstruction.length
                      < MIN_CUSTOM_INSTRUCTION_LENGTH && (
                      <Alert severity="warning" role="presentation" sx={{ mt: 1 }}>
                        Custom instructions must be at least
                        {' '}
                        {MIN_CUSTOM_INSTRUCTION_LENGTH}
                        {' '}
                        characters long
                      </Alert>
                    )}
                  </div>
                </Grid>
              </Grid>
            </Grid>
          )}
        </SettingsTabPanel>

        <SettingsTabPanel
          tabId="about"
          activeTabId={activeTab}
          visited={visitedTabs.has('about')}
          dialogId={id}
        >
          <Grid size={12}>
            <SettingRow
              label="maidr.js Version"
              input={(
                <Typography variant="body2">{diagnostics.version}</Typography>
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="Loaded From"
              alignLabel={sourceUrl ? 'flex-start' : 'center'}
              input={(
                <>
                  <Typography variant="body2">
                    {describeMaidrSource(diagnostics.source)}
                  </Typography>
                  {sourceUrl && (
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', wordBreak: 'break-all' }}
                    >
                      {sourceUrl}
                    </Typography>
                  )}
                </>
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="Browser"
              input={(
                <Typography variant="body2">{diagnostics.browser}</Typography>
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="Operating System"
              input={(
                <Typography variant="body2">
                  {diagnostics.operatingSystem}
                </Typography>
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="Diagnostics"
              input={(
                <Grid container spacing={1} alignItems="center">
                  <Grid size="auto">
                    <Button
                      variant="outlined"
                      color="inherit"
                      size="small"
                      onClick={handleCopyDiagnostics}
                      aria-label="Copy diagnostics to clipboard"
                      aria-describedby={copyStatusId}
                    >
                      Copy diagnostics
                    </Button>
                  </Grid>
                  <Grid size="auto">
                    {/* Rendered even while empty: a live region has to be in
                        the DOM before its text changes for the update to be
                        announced. */}
                    <Typography
                      id={copyStatusId}
                      variant="caption"
                      role="status"
                      aria-live="polite"
                      sx={{
                        color: copyState.status === 'failed'
                          ? 'error.main'
                          : 'text.secondary',
                      }}
                    >
                      {/* Keyed by attempt so React swaps the node on every
                          copy. Re-rendering the same text would leave the
                          region untouched, and an untouched live region is
                          never announced. */}
                      <span key={copyState.attempt}>
                        {COPY_STATUS_MESSAGE[copyState.status]}
                      </span>
                    </Typography>
                  </Grid>
                </Grid>
              )}
            />
          </Grid>
        </SettingsTabPanel>
      </DialogContent>

      {/* Footer Actions */}
      <Grid
        container
        component={DialogActions}
        alignItems="center"
        className="settings-footer"
      >
        {/* Says where the edit blocking Save is, for a reader who is not on
            that tab to see the panel's own warning. Suppressed on the AI tab
            itself, where that warning already sits beside the field.

            Rendered even while empty, for the same reason the copy status
            below is: a live region has to be in the DOM before its text
            changes for the change to be announced, and this one's text can
            only appear on a tab switch — the fields that invalidate the
            instruction are on the tab where the hint is silent. Created
            already carrying its message, it would announce nothing at all.

            On its own row, because sharing the buttons' row wraps "Save &
            Close" off the bottom of the dialog, and inset by `px` so it
            lines up with the setting labels above it and with the Reset
            button's own text. */}
        <Grid size={12} sx={{ px: 2 }}>
          <Typography
            variant="caption"
            role="status"
            aria-live="polite"
            className="settings-footer-hint"
            sx={{ color: 'error.main' }}
          >
            {!isCustomInstructionValid && activeTab !== 'ai'
              ? `Custom instructions on the AI tab must be at least ${MIN_CUSTOM_INSTRUCTION_LENGTH} characters long`
              : ''}
          </Typography>
        </Grid>
        <Grid size="auto" className="settings-grid-padding">
          <Button
            variant="text"
            color="inherit"
            onClick={handleReset}
            aria-label="Reset Settings"
          >
            Reset
          </Button>
        </Grid>
        <Grid
          size="grow"
          container
          spacing={1}
          justifyContent="flex-end"
          alignItems="center"
          className="settings-footer-actions"
        >
          <Grid size="auto">
            <Button
              variant="outlined"
              color="inherit"
              onClick={handleClose}
              aria-label="Close Settings with no changes"
              aria-keyshortcuts={`Alt+${CANCEL_SHORTCUT_KEY}`}
            >
              Close
            </Button>
          </Grid>
          <Grid size="auto">
            {/* `aria-disabled`, not `disabled`. A disabled button leaves the
                tab order, so a reader working through the footer never meets
                Save at all and never learns it is unavailable, let alone why
                — and `title` cannot tell them either, since it needs a hover
                they have no way to perform. Kept focusable, the button
                announces its own state and carries the reason as its
                description, and pressing it answers the same way the
                shortcut does instead of doing nothing. */}
            <Button
              variant="contained"
              color="primary"
              onClick={handleSaveRequest}
              aria-disabled={!isCustomInstructionValid || undefined}
              aria-describedby={
                isCustomInstructionValid ? undefined : saveBlockedId
              }
              aria-label="Save & Close Settings"
              aria-keyshortcuts={`Alt+${SAVE_SHORTCUT_KEY}`}
              // Reads as unavailable without being it. `disabled` would style
              // this for free, at the cost of the reachability above.
              sx={
                isCustomInstructionValid
                  ? undefined
                  : {
                      'backgroundColor': 'action.disabledBackground',
                      'color': 'action.disabled',
                      'boxShadow': 'none',
                      '&:hover': {
                        backgroundColor: 'action.disabledBackground',
                        boxShadow: 'none',
                      },
                    }
              }
            >
              Save & Close
            </Button>
            {/* The button's description. Separate from the footer hint above,
                which is a live region announcing a change and stays quiet on
                the AI tab; this is a static description, and has to be there
                on every tab, because the button is. */}
            {!isCustomInstructionValid && (
              <span id={saveBlockedId} style={visuallyHidden}>
                {`Custom instructions on the AI tab must be at least ${MIN_CUSTOM_INSTRUCTION_LENGTH} characters long`}
              </span>
            )}
          </Grid>
        </Grid>
      </Grid>
    </Dialog>
  );
};

export default Settings;
