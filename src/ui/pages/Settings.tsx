import type {
  SelectChangeEvent,
} from '@mui/material';
import type { Llm, LlmVersion } from '@type/llm';
import type { AriaMode, GeneralSettings, LlmModelSettings, LlmSettings } from '@type/settings';
import { Check as CheckIcon, Error as ErrorIcon } from '@mui/icons-material';
import {
  Button,
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
import { useViewModel } from '@state/hook/useViewModel';
import React, { useCallback, useEffect, useId, useState } from 'react';

type GptVersion = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4.1' | 'o1-mini' | 'o3' | 'o4-mini';
type ClaudeVersion = 'claude-3-5-haiku-latest' | 'claude-3-5-sonnet-latest' | 'claude-3-7-sonnet-latest';
type GeminiVersion = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-flash-preview-04-17' | 'gemini-2.5-pro-preview-05-06';

interface ModelConfig<T extends LlmVersion> {
  default: T;
  options: readonly T[];
  labels: Record<T, string>;
}

interface ModelVersions {
  GPT: ModelConfig<GptVersion>;
  CLAUDE: ModelConfig<ClaudeVersion>;
  GEMINI: ModelConfig<GeminiVersion>;
}

export const MODEL_VERSIONS: ModelVersions = {
  GPT: {
    default: 'gpt-4o',
    options: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o1-mini', 'o3', 'o4-mini'] as const,
    labels: {
      'gpt-4o': 'GPT-4o',
      'gpt-4o-mini': 'GPT-4o Mini',
      'gpt-4.1': 'GPT-4.1',
      'o1-mini': 'o1-mini',
      'o3': 'o3',
      'o4-mini': 'o4-mini',
    },
  },
  CLAUDE: {
    default: 'claude-3-7-sonnet-latest',
    options: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest'] as const,
    labels: {
      'claude-3-5-haiku-latest': 'Claude 3.5 Haiku',
      'claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet',
      'claude-3-7-sonnet-latest': 'Claude 3.7 Sonnet',
    },
  },
  GEMINI: {
    default: 'gemini-2.0-flash',
    options: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-preview-04-17', 'gemini-2.5-pro-preview-05-06'] as const,
    labels: {
      'gemini-2.0-flash': 'Gemini 2.0 Flash',
      'gemini-2.0-flash-lite': 'Gemini 2.0 Flash Lite',
      'gemini-2.5-flash-preview-04-17': 'Gemini 2.5 Flash Preview',
      'gemini-2.5-pro-preview-05-06': 'Gemini 2.5 Pro Preview',
    },
  },
};

function getValidVersion(modelKey: Llm, currentVersion: string | undefined): LlmVersion {
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
}

const SettingRow: React.FC<SettingRowProps> = ({ label, input }) => (
  <Grid container spacing={1} alignItems="center" sx={{ py: 1 }}>
    <Grid size={{ xs: 12, sm: 6, md: 4 }}>
      <Typography variant="body2" fontWeight="normal">
        {label}
      </Typography>
    </Grid>
    <Grid size={{ xs: 12, sm: 6, md: 8 }}>
      {input}
    </Grid>
  </Grid>
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
      const result = await LlmValidationService.validateApiKey(modelKey, apiKey);
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
      return (
        <MenuItem
          key={version}
          value={version}
          sx={{ fontWeight: modelSettings.version === version ? 'bold' : 'normal' }}
        >
          {modelSettings.version === version && <CheckIcon sx={{ mr: 1 }} />}
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
          <Grid size="auto">
            <Switch
              checked={modelSettings.enabled}
              onChange={e => onToggle(modelKey, e.target.checked)}
              slotProps={{
                input: { 'aria-label': `Enable ${modelSettings.name}` },
              }}
            />
          </Grid>
          <Grid size={6}>
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
                  'aria-label': `${modelSettings.name} API key input`,
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
          </Grid>
          <Grid size={6}>
            <Select
              value={validVersion}
              onChange={(e) => {
                const newVersion = e.target.value as LlmVersion;
                onChangeVersion(modelKey, newVersion);
              }}
              disabled={!modelSettings.enabled || !modelSettings.apiKey.trim() || !isValid}
              fullWidth
              size="small"
              MenuProps={{
                disablePortal: true,
                PaperProps: {
                  sx: {
                    maxHeight: 200,
                  },
                },
              }}
            >
              {renderMenuItems()}
            </Select>
          </Grid>
        </Grid>
      )}
    />
  );
};

const Settings: React.FC = () => {
  const id = useId();
  const viewModel = useViewModel('settings');
  const { general, llm } = viewModel.state;

  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(general);
  const [llmSettings, setLlmSettings] = useState<LlmSettings>(llm);

  useEffect(() => {
    viewModel.load();
  }, [viewModel]);

  useEffect(() => {
    setGeneralSettings(general);
    setLlmSettings(llm);
  }, [general, llm]);

  const handleGeneralChange = (key: keyof GeneralSettings, value: string | number | AriaMode): void => { // Expanded value type for ariaMode
    setGeneralSettings(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleLlmChange = (key: keyof LlmSettings, value: string | 'basic' | 'intermediate' | 'advanced'): void => {
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
          [propKey]: propKey === 'apiKey' && typeof value === 'string' ? value.trim() : value,
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

  const handleClose = (): void => {
    viewModel.toggle();
  };

  const handleSave = (): void => {
    viewModel.saveAndClose({ general: generalSettings, llm: llmSettings });
    useViewModel('chat').loadInitialMessage();
  };

  const handleSelectClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleSelectChange = useCallback((e: SelectChangeEvent<'basic' | 'intermediate' | 'advanced'>) => {
    e.stopPropagation();
    handleLlmChange('expertiseLevel', e.target.value);
  }, [handleLlmChange]);

  return (
    <Dialog
      id={id}
      role="dialog"
      open={true}
      maxWidth="sm"
      fullWidth
      disablePortal
      disableEnforceFocus
      onClick={e => e.stopPropagation()}
      sx={{
        '& .MuiDialog-paper': {
          zIndex: 9998,
          maxHeight: '90vh',
        },
        '& .MuiDialogContent-root': {
          overflow: 'auto',
        },
      }}
    >
      <DialogContent>
        <Grid size="grow">
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Settings
          </Typography>
        </Grid>

        {/* General Settings */}
        <Grid container spacing={0.5}>
          <Grid size={12}>
            <SettingRow
              label="Volume"
              input={(
                <Slider
                  value={generalSettings.volume}
                  onChange={(_, value) => handleGeneralChange('volume', Number(value))}
                  min={0}
                  max={100}
                  step={1}
                  valueLabelDisplay="auto"
                  sx={{
                    '& .MuiSlider-valueLabel': {
                      backgroundColor: 'primary.main',
                      borderRadius: 1,
                    },
                  }}
                />
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="Outline Color"
              input={(
                <TextField
                  fullWidth
                  type="color"
                  size="small"
                  value={generalSettings.highlightColor}
                  onChange={e => handleGeneralChange('highlightColor', e.target.value)}
                />
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="Braille Display Size"
              input={(
                <TextField
                  fullWidth
                  type="number"
                  size="small"
                  value={generalSettings.brailleDisplaySize}
                  onChange={e => handleGeneralChange('brailleDisplaySize', Number(e.target.value))}
                />
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="Min Frequency (Hz)"
              input={(
                <TextField
                  fullWidth
                  type="number"
                  size="small"
                  value={generalSettings.minFrequency}
                  onChange={e => handleGeneralChange('minFrequency', Number(e.target.value))}
                />
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="Max Frequency (Hz)"
              input={(
                <TextField
                  fullWidth
                  type="number"
                  size="small"
                  value={generalSettings.maxFrequency}
                  onChange={e => handleGeneralChange('maxFrequency', Number(e.target.value))}
                />
              )}
            />
          </Grid>
          <Grid size={12}>
            <SettingRow
              label="Autoplay Duration (ms)"
              input={(
                <TextField
                  fullWidth
                  type="number"
                  size="small"
                  value={generalSettings.autoplayDuration}
                  onChange={e => handleGeneralChange('autoplayDuration', Number(e.target.value))}
                />
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
                    onChange={e => handleGeneralChange('ariaMode', e.target.value as AriaMode)}
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
        </Grid>

        <Grid size={12}>
          <Divider sx={{ py: 0.5 }} />
        </Grid>

        {/* LLM Settings */}
        <Grid container spacing={0.5} sx={{ mt: 2 }}>
          <Grid size={12}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              LLM Settings
            </Typography>
          </Grid>

          {(Object.keys(llmSettings.models) as Llm[]).map((modelKey) => {
            const model = llmSettings.models[modelKey];
            return (
              <Grid size={12} key={modelKey}>
                <LlmModelSettingRow
                  modelKey={modelKey}
                  modelSettings={model}
                  onToggle={(key, enabled) => handleLlmModelChange(key, 'enabled', enabled)}
                  onChangeKey={(key, value) => handleLlmModelChange(key, 'apiKey', value)}
                  onChangeVersion={(key, value) => handleLlmModelChange(key, 'version', value)}
                />
              </Grid>
            );
          })}

          {/* Expertise Level */}
          <Grid size={12}>
            <SettingRow
              label="Expertise Level"
              input={(
                <FormControl fullWidth size="small">
                  <Select
                    value={llmSettings.expertiseLevel}
                    onChange={handleSelectChange}
                    onClick={handleSelectClick}
                    MenuProps={{
                      disablePortal: true,
                      PaperProps: {
                        sx: {
                          maxHeight: 200,
                        },
                      },
                    }}
                  >
                    <MenuItem value="basic">Basic</MenuItem>
                    <MenuItem value="intermediate">Intermediate</MenuItem>
                    <MenuItem value="advanced">Advanced</MenuItem>
                  </Select>
                </FormControl>
              )}
            />
          </Grid>

          <Grid size={12}>
            <Grid container spacing={1} alignItems="flex-start" sx={{ py: 1 }}>
              <Grid size={12} sx={{ py: 1 }}>
                <Typography variant="body2" fontWeight="normal">
                  Custom Instructions
                </Typography>
              </Grid>
              <Grid size={12}>
                <TextareaAutosize
                  minRows={3}
                  maxRows={6}
                  value={llmSettings.customInstruction}
                  onChange={e => handleLlmChange('customInstruction', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                  }}
                  placeholder="Enter custom instruction..."
                />
              </Grid>
            </Grid>
          </Grid>
        </Grid>

        <Grid size={12}>
          <Divider sx={{ py: 0.5 }} />
        </Grid>
      </DialogContent>

      {/* Footer Actions  */}
      <Grid
        container
        component={DialogActions}
        alignItems="center"
      >
        <Grid size="auto" sx={{ px: 1 }}>
          <Button variant="text" color="inherit" onClick={handleReset}>
            Reset
          </Button>
        </Grid>
        <Grid
          size="grow"
          container
          spacing={1}
          justifyContent="flex-end"
          sx={{ px: 2, py: 1 }}
        >
          <Grid size="auto">
            <Button variant="outlined" color="inherit" onClick={handleClose}>
              Close
            </Button>
          </Grid>
          <Grid size="auto">
            <Button variant="contained" color="primary" onClick={handleSave}>
              Save & Close
            </Button>
          </Grid>
        </Grid>
      </Grid>
    </Dialog>
  );
};

export default Settings;
