import type { Llm, LlmVersion } from '@type/llm';
import type { AriaMode, GeneralSettings, LlmModelSettings, LlmSettings } from '@type/settings';
import { Check as CheckIcon } from '@mui/icons-material';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
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
import { useViewModel } from '@state/hook/useViewModel';
import React, { useEffect, useId, useState } from 'react';

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
  return (
    <SettingRow
      label={modelSettings.name}
      input={(
        <Grid container spacing={1} alignItems="center">
          <Grid size="auto">
            {' '}
            <Switch
              checked={modelSettings.enabled}
              onChange={e => onToggle(modelKey, e.target.checked)}
              slotProps={{
                input: { 'aria-label': `Enable ${modelSettings.name}` },
              }}
            />
          </Grid>
          <Grid size="grow">
            {' '}
            <TextField
              disabled={!modelSettings.enabled}
              fullWidth
              size="small"
              value={modelSettings.apiKey}
              onChange={e => onChangeKey(modelKey, e.target.value)}
              placeholder={`Enter ${modelSettings.name} API Key`}
              type="password"
            />
          </Grid>
          <Grid size="auto">
            <Grid size="auto">
              <Select
                value={modelSettings.version}
                onChange={(e) => {
                  const newVersion = e.target.value as LlmVersion;
                  onChangeVersion(modelKey, newVersion);
                }}
                MenuProps={{
                  disablePortal: true,
                  PaperProps: {
                    sx: {
                      maxHeight: 200,
                    },
                  },
                }}
              >
                {modelKey === 'GPT' && (
                  <>
                    <MenuItem value="gpt-4o" sx={{ fontWeight: modelSettings.version === 'gpt-4o' ? 'bold' : 'normal' }}>
                      {modelSettings.version === 'gpt-4o' && <CheckIcon sx={{ mr: 1 }} />}
                      GPT-4o
                    </MenuItem>
                    <MenuItem value="gpt-4o-mini" sx={{ fontWeight: modelSettings.version === 'gpt-4o-mini' ? 'bold' : 'normal' }}>
                      {modelSettings.version === 'gpt-4o-mini' && <CheckIcon sx={{ mr: 1 }} />}
                      GPT-4o Mini
                    </MenuItem>
                    <MenuItem value="gpt-4.1" sx={{ fontWeight: modelSettings.version === 'gpt-4.1' ? 'bold' : 'normal' }}>
                      {modelSettings.version === 'gpt-4.1' && <CheckIcon sx={{ mr: 1 }} />}
                      GPT-4.1
                    </MenuItem>
                    <MenuItem value="o1-mini" sx={{ fontWeight: modelSettings.version === 'o1-mini' ? 'bold' : 'normal' }}>
                      {modelSettings.version === 'o1-mini' && <CheckIcon sx={{ mr: 1 }} />}
                      o1-mini
                    </MenuItem>
                    <MenuItem value="o3" sx={{ fontWeight: modelSettings.version === 'o3' ? 'bold' : 'normal' }}>
                      {modelSettings.version === 'o3' && <CheckIcon sx={{ mr: 1 }} />}
                      o3
                    </MenuItem>
                    <MenuItem value="o4-mini" sx={{ fontWeight: modelSettings.version === 'o4-mini' ? 'bold' : 'normal' }}>
                      {modelSettings.version === 'o4-mini' && <CheckIcon sx={{ mr: 1 }} />}
                      o4-mini
                    </MenuItem>
                  </>
                )}
                {modelKey === 'CLAUDE' && (
                  <>
                    <MenuItem value="claude-3-5-haiku-latest" sx={{ fontWeight: modelSettings.version === 'claude-3-5-haiku-latest' ? 'bold' : 'normal' }}>
                      {modelSettings.version === 'claude-3-5-haiku-latest' && <CheckIcon sx={{ mr: 1 }} />}
                      Claude 3.5 Haiku
                    </MenuItem>
                    <MenuItem value="claude-3-5-sonnet-latest" sx={{ fontWeight: modelSettings.version === 'claude-3-5-sonnet-latest' ? 'bold' : 'normal' }}>
                      {modelSettings.version === 'claude-3-5-sonnet-latest' && <CheckIcon sx={{ mr: 1 }} />}
                      Claude 3.5 Sonnet
                    </MenuItem>
                    <MenuItem value="claude-3-7-sonnet-latest" sx={{ fontWeight: modelSettings.version === 'claude-3-7-sonnet-latest' ? 'bold' : 'normal' }}>
                      {modelSettings.version === 'claude-3-7-sonnet-latest' && <CheckIcon sx={{ mr: 1 }} />}
                      Claude 3.7 Sonnet
                    </MenuItem>
                  </>
                )}
                {modelKey === 'GEMINI' && (
                  <>
                    <MenuItem value="gemini-2.0-flash" sx={{ fontWeight: modelSettings.version === 'gemini-2.0-flash' ? 'bold' : 'normal' }}>
                      {modelSettings.version === 'gemini-2.0-flash' && <CheckIcon sx={{ mr: 1 }} />}
                      Gemini 2.0 Flash
                    </MenuItem>
                    <MenuItem value="gemini-2.0-flash-lite" sx={{ fontWeight: modelSettings.version === 'gemini-2.0-flash-lite' ? 'bold' : 'normal' }}>
                      {modelSettings.version === 'gemini-2.0-flash-lite' && <CheckIcon sx={{ mr: 1 }} />}
                      Gemini 2.0 Flash Lite
                    </MenuItem>
                    <MenuItem value="gemini-2.5-flash-preview-04-17" sx={{ fontWeight: modelSettings.version === 'gemini-2.5-flash-preview-04-17' ? 'bold' : 'normal' }}>
                      {modelSettings.version === 'gemini-2.5-flash-preview-04-17' && <CheckIcon sx={{ mr: 1 }} />}
                      Gemini 2.5 Flash Preview
                    </MenuItem>
                    <MenuItem value="gemini-2.5-pro-preview-05-06" sx={{ fontWeight: modelSettings.version === 'gemini-2.5-pro-preview-05-06' ? 'bold' : 'normal' }}>
                      {modelSettings.version === 'gemini-2.5-pro-preview-05-06' && <CheckIcon sx={{ mr: 1 }} />}
                      Gemini 2.5 Pro Preview
                    </MenuItem>
                  </>
                )}
              </Select>
            </Grid>
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
  }, [viewModel]); // Added viewModel to dependency array if `load` relies on the viewModel instance

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

  const handleLlmChange = (key: keyof LlmSettings, value: string): void => {
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
          [propKey]: value,
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
  };

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
                    onChange={e => handleLlmChange('expertiseLevel', e.target.value)}
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
