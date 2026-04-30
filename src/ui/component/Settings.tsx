import type { SelectChangeEvent } from '@mui/material';
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
  Divider,
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
  TextareaAutosize,
  TextField,
  Typography,
} from '@mui/material';
import { LlmValidationService } from '@service/llmValidation';
import { MODEL_VERSIONS } from '@service/modelVersions';
import { useViewModel } from '@state/hook/useViewModel';
import {
  MAX_BRAILLE_LINES,
  MAX_BRAILLE_SIZE,
  MULTI_LINE_BRAILLE_PRESETS,
  SINGLE_LINE_BRAILLE_PRESETS,
} from '@type/settings';
import {
  clampBrailleLines,
  clampBrailleSize,
  findBraillePreset,
  isBrailleDisplayKind,
  selectBrailleDisplayKind,
  selectBraillePreset,
} from '@util/braillePreset';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

const MIN_CUSTOM_INSTRUCTION_LENGTH = 10;

function formatSingleLinePreset(p: BrailleDisplayPreset): string {
  return `${p.label} — ${p.manufacturer} (${p.cells} cells)`;
}

function formatMultiLinePreset(p: BrailleDisplayPreset): string {
  return `${p.label} — ${p.manufacturer} (${p.lines} lines × ${p.cells} cells)`;
}

function getValidVersion(
  modelKey: Llm,
  currentVersion: string | undefined,
): LlmVersion {
  const config = MODEL_VERSIONS[modelKey];
  const validOptions = config.options as readonly LlmVersion[];
  if (!currentVersion || !validOptions.includes(currentVersion as LlmVersion)) {
    return config.default;
  }
  return currentVersion as LlmVersion;
}

interface SettingRowProps {
  label: string;
  input: React.ReactNode;
  alignLabel?: 'center' | 'flex-start';
}

const SettingRow: React.FC<SettingRowProps> = ({ label, input, alignLabel = 'center' }) => (
  <Grid container spacing={1} alignItems={alignLabel} className="settings-grid-container" sx={{ py: 1 }}>
    <Grid size={{ xs: 12, sm: 6, md: 4 }} sx={alignLabel === 'flex-start' ? { py: 1 } : undefined}>
      <Typography variant="body2" fontWeight="normal">
        {label}
      </Typography>
    </Grid>
    <Grid size={{ xs: 12, sm: 6, md: 8 }}>{input}</Grid>
  </Grid>
);

interface BraillePresetSelectProps {
  kind: 'single' | 'multi';
  rowLabel: string;
  ariaLabel: string;
  presets: readonly BrailleDisplayPreset[];
  selectedPresetId: string | null;
  formatPreset: (preset: BrailleDisplayPreset) => string;
  onChange: (kind: 'single' | 'multi', presetId: string) => void;
}

const BraillePresetSelect: React.FC<BraillePresetSelectProps> = ({
  kind,
  rowLabel,
  ariaLabel,
  presets,
  selectedPresetId,
  formatPreset,
  onChange,
}) => (
  <SettingRow
    label={rowLabel}
    input={(
      <FormControl fullWidth>
        <Select
          value={selectedPresetId ?? ''}
          onChange={e => onChange(kind, e.target.value)}
          fullWidth
          size="small"
          displayEmpty
          slotProps={{ input: { 'aria-label': ariaLabel } }}
          MenuProps={{ disablePortal: true }}
        >
          <MenuItem value="" disabled>
            Select a display
          </MenuItem>
          {presets.map(preset => (
            <MenuItem key={preset.id} value={preset.id}>
              {formatPreset(preset)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )}
  />
);

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
  const [isValidating, setIsValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);

  const getHelperText = (): string => {
    if (!modelSettings.enabled)
      return '';
    if (isValidating)
      return 'Validating API key...';
    if (isValid === false)
      return `${modelSettings.name} API key is invalid`;
    if (isValid === true)
      return `${modelSettings.name} API key is valid`;
    return '';
  };

  const validateApiKey = async (apiKey: string): Promise<void> => {
    if (!modelSettings.enabled || !apiKey.trim()) {
      setIsValid(null);
      return;
    }

    setIsValidating(true);
    try {
      const result = await LlmValidationService.validateApiKey(
        modelKey,
        apiKey,
      );
      setIsValid(result.isValid);
    } catch (error) {
      setIsValid(false);
    } finally {
      setIsValidating(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      validateApiKey(modelSettings.apiKey);
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [modelSettings.apiKey, modelSettings.enabled, modelKey]);

  const renderMenuItems = (): React.ReactNode[] => {
    const config = MODEL_VERSIONS[modelKey];
    return config.options.map((version) => {
      const label = config.labels[version as keyof typeof config.labels];
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
                placeholder={`Enter ${modelSettings.name} API Key`}
                type="password"
                error={isValid === false}
                helperText={getHelperText()}
                slotProps={{
                  input: {
                    'aria-label': `${modelSettings.name} API Key`,
                    'aria-describedby': `${modelKey}-status`,
                    'endAdornment': (
                      <InputAdornment position="end">
                        <div
                          id={`${modelKey}-status`}
                          role="status"
                          aria-live="polite"
                          aria-label={
                            isValidating
                              ? 'Validating API key'
                              : isValid === true
                                ? 'API key is valid'
                                : isValid === false
                                  ? 'API key is invalid'
                                  : ''
                          }
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
                  PaperProps: {
                    className: 'settings-menu-paper',
                  },
                }}
              >
                {renderMenuItems()}
              </Select>
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
  const { general, llm } = viewModel.state;

  const [generalSettings, setGeneralSettings]
    = useState<GeneralSettings>(general);
  const [llmSettings, setLlmSettings] = useState<LlmSettings>(llm);

  useEffect(() => {
    viewModel.load();
  }, [viewModel]);

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

  const handleBrailleKindChange = useCallback((kind: BrailleDisplayKind): void => {
    setGeneralSettings((prev) => {
      // Manual omits size/lines from the slice on purpose so the spread
      // preserves the existing values as the starting point for edits.
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

  // If stored settings claim a single/multi kind but the preset id is
  // missing or points to a now-removed device, snap back to the first
  // preset in that kind so the dropdown doesn't render its disabled
  // "Select a display" placeholder out of step with the active radio.
  // The ref captures the values at mount time so the effect runs once
  // with stable inputs and never goes stale.
  const initialKindRef = useRef({
    kind: generalSettings.brailleDisplayKind,
    presetId: generalSettings.brailleDisplayPresetId,
  });
  useEffect(() => {
    const { kind, presetId } = initialKindRef.current;
    if (kind === 'manual') {
      return;
    }
    const presets = kind === 'single'
      ? SINGLE_LINE_BRAILLE_PRESETS
      : MULTI_LINE_BRAILLE_PRESETS;
    if (!findBraillePreset(presets, presetId)) {
      handleBrailleKindChange(kind);
    }
  }, []);

  const handleLlmChange = (
    key: keyof LlmSettings,
    value: string | 'basic' | 'intermediate' | 'advanced' | 'custom',
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

  const handleClose = useCallback((): void => {
    viewModel.toggle();
  }, [viewModel]);

  const handleSave = useCallback((): void => {
    viewModel.saveAndClose({ general: generalSettings, llm: llmSettings });
    chatViewModel.refreshInitialMessage();
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

  // Dialog-scoped handler instead of a document listener: Alt+s / Alt+c
  // need to fire even when focus is inside one of the dialog's text inputs
  // (e.g. the manual cells/lines field). Routing through the global
  // `KeybindingService` would not work for this case because its
  // `hotkeys.filter` blocks all bindings while a non-MAIDR `<input>` has
  // focus. Binding to the Dialog's own onKeyDown keeps the listener
  // component-scoped (no global capture-phase listener) while still
  // catching keydowns that bubble up from the dialog's inputs.
  const handleDialogKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 's') {
        if (!isCustomInstructionValid) {
          return;
        }
        e.preventDefault();
        handleSave();
      } else if (key === 'c') {
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
      aria-label="Settings"
      open={true}
      maxWidth="sm"
      fullWidth
      disablePortal
      disableEnforceFocus
      onClick={e => e.stopPropagation()}
      onKeyDown={handleDialogKeyDown}
      className="settings-dialog"
    >
      <DialogContent className="settings-dialog-content">
        <Grid size="grow">
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            General Settings
          </Typography>
        </Grid>

        {/* General Settings */}
        <Grid container spacing={0.5}>
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
          <Grid size={12}>
            <SettingRow
              label="Braille Display"
              alignLabel="flex-start"
              input={(
                <FormControl>
                  <RadioGroup
                    row
                    value={generalSettings.brailleDisplayKind}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (isBrailleDisplayKind(v)) {
                        handleBrailleKindChange(v);
                      }
                    }}
                    aria-label="Braille display type"
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
                kind="single"
                rowLabel="Single-Line Display"
                ariaLabel="Single-Line Braille Display"
                presets={SINGLE_LINE_BRAILLE_PRESETS}
                selectedPresetId={generalSettings.brailleDisplayPresetId}
                formatPreset={formatSingleLinePreset}
                onChange={handleBraillePresetChange}
              />
            </Grid>
          )}
          {generalSettings.brailleDisplayKind === 'multi' && (
            <Grid size={12}>
              <BraillePresetSelect
                kind="multi"
                rowLabel="Multi-Line Display"
                ariaLabel="Multi-Line Braille Display"
                presets={MULTI_LINE_BRAILLE_PRESETS}
                selectedPresetId={generalSettings.brailleDisplayPresetId}
                formatPreset={formatMultiLinePreset}
                onChange={handleBraillePresetChange}
              />
            </Grid>
          )}
          {generalSettings.brailleDisplayKind === 'manual' && (
            <>
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
                          const raw = e.target.value;
                          if (raw === '') {
                            return;
                          }
                          const parsed = Number(raw);
                          if (Number.isNaN(parsed)) {
                            return;
                          }
                          handleGeneralChange('brailleDisplaySize', clampBrailleSize(parsed));
                        }}
                        onBlur={e =>
                          handleGeneralChange(
                            'brailleDisplaySize',
                            clampBrailleSize(Number(e.target.value)),
                          )}
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
                          // Guard against NaN / empty (e.g. when the user clears
                          // the field). The stored value stays valid even if blur
                          // never fires. Clamp/floor on every keystroke so a user
                          // who types `0` and tabs away is not silently reset.
                          const raw = e.target.value;
                          if (raw === '') {
                            return;
                          }
                          const parsed = Number(raw);
                          if (Number.isNaN(parsed)) {
                            return;
                          }
                          handleGeneralChange('brailleDisplayLines', clampBrailleLines(parsed));
                        }}
                        onBlur={e =>
                          handleGeneralChange(
                            'brailleDisplayLines',
                            clampBrailleLines(Number(e.target.value)),
                          )}
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
            </>
          )}
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
        </Grid>

        <Grid size={12}>
          <Divider className="settings-divider" />
        </Grid>

        {/* LLM Settings */}
        <Grid container spacing={0.5} className="settings-section">
          <Grid size={12}>
            <Typography
              variant="h6"
              fontWeight="bold"
              gutterBottom
              className="settings-section-title"
            >
              LLM Settings
            </Typography>
          </Grid>

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
        </Grid>

        <Grid size={12}>
          <Divider className="settings-divider" />
        </Grid>
      </DialogContent>

      {/* Footer Actions */}
      <Grid
        container
        component={DialogActions}
        alignItems="center"
        className="settings-footer"
      >
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
          className="settings-footer-actions"
        >
          <Grid size="auto">
            <Button
              variant="outlined"
              color="inherit"
              onClick={handleClose}
              aria-label="Close Settings with no changes"
              aria-keyshortcuts="Alt+c"
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
              aria-keyshortcuts="Alt+s"
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
