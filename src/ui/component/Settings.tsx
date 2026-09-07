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

/**
 * One page of the settings dialog.
 *
 * The groups are the modality a setting reaches the reader through — what a
 * reader looking for a setting knows about it — rather than the service that
 * happens to own it.
 */
type SettingsTabId = 'general' | 'audio' | 'visual' | 'braille' | 'ai' | 'about';

interface SettingsTab {
  readonly id: SettingsTabId;
  readonly label: string;
}

const SETTINGS_TABS: readonly SettingsTab[] = [
  { id: 'general', label: 'General' },
  { id: 'audio', label: 'Audio' },
  { id: 'visual', label: 'Visual' },
  { id: 'braille', label: 'Braille & Tactile' },
  { id: 'ai', label: 'AI' },
  { id: 'about', label: 'About' },
];

const DEFAULT_SETTINGS_TAB: SettingsTabId = 'general';

// Keeps a tab's badge on the same baseline as its text.
const TAB_LABEL_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

interface SettingsTabPanelProps {
  readonly tabId: SettingsTabId;
  readonly activeTabId: SettingsTabId;
  /** The dialog's `useId` prefix, so panel and tab ids pair up. */
  readonly dialogId: string;
  readonly children: React.ReactNode;
}

/**
 * The rows of one settings tab.
 *
 * An inactive panel renders nothing at all rather than hiding: the edits live
 * in the dialog's state, not in the fields, so unmounting a panel loses no
 * input, and it keeps the API-key probes in the AI panel from running for a
 * reader who never opens it.
 *
 * @param props - The panel's configuration.
 * @param props.tabId - The tab this panel belongs to.
 * @param props.activeTabId - The tab currently selected in the dialog.
 * @param props.dialogId - The dialog's `useId` prefix.
 * @param props.children - The setting rows to render.
 * @returns The panel when its tab is selected, otherwise nothing.
 */
const SettingsTabPanel: React.FC<SettingsTabPanelProps> = ({
  tabId,
  activeTabId,
  dialogId,
  children,
}) => {
  if (tabId !== activeTabId) {
    return null;
  }
  return (
    <Grid
      container
      spacing={0.5}
      role="tabpanel"
      id={`${dialogId}-panel-${tabId}`}
      aria-labelledby={`${dialogId}-tab-${tabId}`}
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

  const [activeTab, setActiveTab] = useState<SettingsTabId>(DEFAULT_SETTINGS_TAB);
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
  const tactileMenu = useModalContainer();
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

  const handleTabChange = useCallback(
    (_event: React.SyntheticEvent, tabId: SettingsTabId): void => {
      setActiveTab(tabId);
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
        if (!isCustomInstructionValid) {
          return;
        }
        e.preventDefault();
        handleSave();
      } else if (key === CANCEL_SHORTCUT_KEY) {
        e.preventDefault();
        handleClose();
      }
    },
    [isCustomInstructionValid, handleSave, handleClose],
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
        sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        {SETTINGS_TABS.map(tab => (
          <Tab
            key={tab.id}
            value={tab.id}
            id={`${id}-tab-${tab.id}`}
            // Only the selected panel is rendered, so only the selected tab
            // has one to point at. Naming an id that is not in the document
            // is a dangling reference, which is a defect whether or not a
            // reader happens to follow it.
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
        className="settings-dialog-content"
        sx={{ minHeight: 'min(400px, 45vh)' }}
      >
        <SettingsTabPanel tabId="general" activeTabId={activeTab} dialogId={id}>
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

        <SettingsTabPanel tabId="audio" activeTabId={activeTab} dialogId={id}>
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

        <SettingsTabPanel tabId="visual" activeTabId={activeTab} dialogId={id}>
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

        <SettingsTabPanel tabId="braille" activeTabId={activeTab} dialogId={id}>
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

        <SettingsTabPanel tabId="ai" activeTabId={activeTab} dialogId={id}>
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
                    />
                  </FormControl>
                </Grid>
                {llmSettings.customInstruction.length
                  < MIN_CUSTOM_INSTRUCTION_LENGTH && (
                  <Grid size={12} sx={{ mt: 1 }}>
                    <Alert severity="warning">
                      Custom instructions must be at least
                      {' '}
                      {MIN_CUSTOM_INSTRUCTION_LENGTH}
                      {' '}
                      characters long
                    </Alert>
                  </Grid>
                )}
              </Grid>
            </Grid>
          )}
        </SettingsTabPanel>

        <SettingsTabPanel tabId="about" activeTabId={activeTab} dialogId={id}>
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
        {/* Only while that tab is closed: the AI panel carries the same
            warning beside the field itself, and the footer's job here is the
            one part the panel cannot give — where to go. A `status` region so
            the reason reaches a reader who is several tabs away when Save
            goes disabled; the text is constant while they type, so it
            announces once rather than on every keystroke. On its own row,
            because sharing the buttons' row wraps "Save & Close" off the
            bottom of the dialog, and inset by `px` so it lines up with the
            setting labels above it and with the Reset button's own text. */}
        {!isCustomInstructionValid && activeTab !== 'ai' && (
          <Grid size={12} sx={{ px: 2 }}>
            <Typography
              variant="caption"
              role="status"
              className="settings-footer-hint"
              sx={{ color: 'error.main' }}
            >
              {`Custom instructions on the AI tab must be at least ${MIN_CUSTOM_INSTRUCTION_LENGTH} characters long`}
            </Typography>
          </Grid>
        )}
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
            <Button
              variant="contained"
              color="primary"
              onClick={handleSave}
              disabled={!isCustomInstructionValid}
              title={
                !isCustomInstructionValid
                  ? `Custom instructions must be at least ${MIN_CUSTOM_INSTRUCTION_LENGTH} characters long`
                  : ''
              }
              aria-label="Save & Close Settings"
              aria-keyshortcuts={`Alt+${SAVE_SHORTCUT_KEY}`}
            >
              Save & Close
            </Button>
          </Grid>
        </Grid>
      </Grid>
    </Dialog>
  );
};

export default Settings;
