import type { Llm } from '@type/llm';
import type { AriaMode, GeneralSettings, LlmModelSettings, LlmSettings } from '@type/settings';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  FormControl,
  FormControlLabel,
  Grid2,
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
import { useAppDispatch, useAppSelector } from '@redux/hook/useStore';
import { loadSettings, resetSettings, saveSettings, toggleSettings } from '@redux/slice/settingsSlice';
import React, { useEffect, useState } from 'react';

interface SettingRowProps {
  label: string;
  input: React.ReactNode;
}

const SettingRow: React.FC<SettingRowProps> = ({ label, input }) => (
  <Grid2 container spacing={1} alignItems="center" sx={{ py: 1 }}>
    <Grid2 size={{ xs: 12, sm: 6, md: 4 }}>
      <Typography variant="body2" fontWeight="normal">
        {label}
      </Typography>
    </Grid2>
    <Grid2 size={{ xs: 12, sm: 6, md: 8 }}>
      {input}
    </Grid2>
  </Grid2>
);

interface LlmModelSettingRowProps {
  modelKey: Llm;
  modelSettings: LlmModelSettings;
  onToggle: (key: Llm, enabled: boolean) => void;
  onChangeKey: (key: Llm, value: string) => void;
}

const LlmModelSettingRow: React.FC<LlmModelSettingRowProps> = ({
  modelKey,
  modelSettings,
  onToggle,
  onChangeKey,
}) => (
  <SettingRow
    label={modelSettings.name}
    input={(
      <Grid2 container spacing={1} alignItems="center">
        <Grid2 size="auto">
          <Switch
            checked={modelSettings.enabled}
            onChange={e => onToggle(modelKey, e.target.checked)}
            slotProps={{
              input: { 'aria-label': `${!modelSettings.enabled ? 'Enable' : 'Disable'} ${modelSettings.name}` },
            }}
          />
        </Grid2>
        <Grid2 size="grow">
          <TextField
            disabled={!modelSettings.enabled}
            fullWidth
            size="small"
            value={modelSettings.apiKey}
            onChange={e => onChangeKey(modelKey, e.target.value)}
            placeholder={`Enter ${modelSettings.name} API Key`}
          />
        </Grid2>
      </Grid2>
    )}
  />
);

const Settings: React.FC = () => {
  const dispatch = useAppDispatch();
  const { enabled, general, llm } = useAppSelector(state => state.settings);

  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(general);
  const [llmSettings, setLlmSettings] = useState<LlmSettings>(llm);

  useEffect(() => {
    dispatch(loadSettings());
  }, [dispatch]);
  useEffect(() => {
    setGeneralSettings(general);
    setLlmSettings(llm);
  }, [general, llm]);

  const handleGeneralChange = (key: keyof GeneralSettings, value: string | number | boolean): void => {
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
    value: string | boolean,
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
    dispatch(resetSettings());
    setGeneralSettings(general);
  };
  const handleClose = (): void => {
    dispatch(toggleSettings());
  };
  const handleSave = (): void => {
    dispatch(saveSettings({ general: generalSettings, llm: llmSettings }));
  };

  return (
    <Dialog
      role="dialog"
      open={enabled}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disablePortal
      closeAfterTransition={false}
    >
      <DialogContent sx={{ overflow: 'visible' }}>
        {/* Header */}
        <Grid2 size="grow">
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Settings
          </Typography>
        </Grid2>

        {/* General Settings */}
        <Grid2 container spacing={0.5}>

          {/* Volume Slider */}
          <Grid2 size={12}>
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
          </Grid2>

          {/* Highlight Color Picker */}
          <Grid2 size={12}>
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
          </Grid2>

          {/* Braille Display Size Input */}
          <Grid2 size={12}>
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
          </Grid2>

          {/* Min Frequency Input */}
          <Grid2 size={12}>
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
          </Grid2>

          {/* Max Frequency Input */}
          <Grid2 size={12}>
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
          </Grid2>

          {/* Autoplay Duration Input */}
          <Grid2 size={12}>
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
          </Grid2>

          {/* Audio Transition Time */}
          <Grid2 size={12}>
            <SettingRow
              label="Audio Transition Time (ms)"
              input={(
                <TextField
                  fullWidth
                  type="number"
                  size="small"
                  value={generalSettings.audioTransitionTime || 15}
                  onChange={e => handleGeneralChange('audioTransitionTime', Number(e.target.value))}
                  InputProps={{
                    inputProps: { min: 5, max: 100 },
                  }}
                  helperText="Higher values give smoother sound transitions (5-100ms)"
                />
              )}
            />
          </Grid2>

          {/* Sine Wave Extra Smoothing Option */}
          <Grid2 size={12}>
            <SettingRow
              label="Sine Wave Extra Smoothing"
              input={(
                <FormControlLabel
                  control={(
                    <Switch
                      checked={generalSettings.sineWaveSmoothing || false}
                      onChange={e => handleGeneralChange('sineWaveSmoothing', e.target.checked)}
                    />
                  )}
                  label="Apply additional smoothing for sine waves"
                />
              )}
            />
          </Grid2>

          {/* Aria Mode Radio */}
          <Grid2 size={12}>
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
          </Grid2>
        </Grid2>

        <Grid2 size={12}>
          <Divider sx={{ py: 0.5 }} />
        </Grid2>

        {/* LLM Settings */}
        <Grid2 container spacing={0.5} sx={{ mt: 2 }}>
          <Grid2 size={12}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              LLM Settings
            </Typography>
          </Grid2>

          {/* LLM Model Toggles */}
          {(Object.keys(llmSettings.models) as Llm[]).map((modelKey) => {
            const model = llmSettings.models[modelKey];

            return (
              <Grid2 size={12} key={modelKey}>
                <LlmModelSettingRow
                  modelKey={modelKey}
                  modelSettings={model}
                  onToggle={(key, enabled) => handleLlmModelChange(key, 'enabled', enabled)}
                  onChangeKey={(key, value) => handleLlmModelChange(key, 'apiKey', value)}
                />
              </Grid2>
            );
          })}

          {/* Expertise Level */}
          <Grid2 size={12}>
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
          </Grid2>

          {/* Custom Instructions */}
          <Grid2 size={12}>
            <Grid2 container spacing={1} alignItems="flex-start" sx={{ py: 1 }}>
              <Grid2 size={{ xs: 12, sm: 6, md: 4 }} sx={{ py: 1 }}>
                <Typography variant="body2" fontWeight="normal">
                  Custom Instructions
                </Typography>
              </Grid2>
              <Grid2 size={{ xs: 12, sm: 6, md: 8 }}>
                <TextareaAutosize
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
              </Grid2>
            </Grid2>
          </Grid2>
        </Grid2>

        <Grid2 size={12}>
          <Divider sx={{ py: 0.5 }} />
        </Grid2>
      </DialogContent>

      {/* Footer Actions */}
      <Grid2
        container
        component={DialogActions}
      >
        <Grid2
          size="auto"
          sx={{ px: 1 }}
        >
          <Button variant="text" color="inherit" onClick={handleReset}>
            Reset
          </Button>
        </Grid2>
        <Grid2
          size="grow"
          container
          spacing={1}
          justifyContent="flex-end"
          sx={{ px: 2, py: 1 }}
        >
          <Grid2 size="auto">
            <Button variant="outlined" color="inherit" onClick={handleClose}>
              Close
            </Button>
          </Grid2>
          <Grid2 size="auto">
            <Button variant="contained" color="primary" onClick={handleSave}>
              Save
            </Button>
          </Grid2>
        </Grid2>
      </Grid2>
    </Dialog>
  );
};

export default Settings;
