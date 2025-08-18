import type { Llm } from '@type/llm';
import type { AriaMode, GeneralSettings, LlmModelSettings, LlmSettings } from '@type/settings';
import {
  Box,
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
import { LLM_VERSION_MAP } from '@type/llm';
import React, { useEffect, useId, useState } from 'react';

interface SettingRowProps {
  label: string;
  input: React.ReactNode;
  alignLabel?: 'center' | 'flex-start';
}

const SettingRow: React.FC<SettingRowProps> = ({ label, input, alignLabel = 'center' }) => (
  <Grid container spacing={1} alignItems={alignLabel} sx={{ py: 1 }}>
    <Grid size={{ xs: 12, sm: 6, md: 4 }} sx={alignLabel === 'flex-start' ? { py: 1 } : undefined}>
      <Typography variant="body2" fontWeight="normal">
        {label}
      </Typography>
    </Grid>
    <Grid size={{ xs: 12, sm: 6, md: 8 }}>
      {input}
    </Grid>
  </Grid>
);

interface LlmModelSettingRowBaseProps<K extends Llm> {
  modelKey: K;
  modelSettings: LlmModelSettings<K>;
  onToggle: (key: Llm, enabled: boolean) => void;
  onChangeKey: (key: Llm, value: string) => void;
  onChangeVersion: (key: Llm, value: string) => void;
}

function LlmModelSettingRow<K extends Llm,>({
  modelKey,
  modelSettings,
  onToggle,
  onChangeKey,
  onChangeVersion,
}: LlmModelSettingRowBaseProps<K>): React.JSX.Element {
  const options = LLM_VERSION_MAP[modelKey] as ReadonlyArray<typeof modelSettings['version']>;
  const currentVersion = modelSettings.version;
  const effectiveValue = options.includes(currentVersion) ? currentVersion : options[0];

  return (
    <SettingRow
      label={modelSettings.name}
      input={(
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, width: '100%' }}>
          <Switch
            checked={modelSettings.enabled}
            onChange={e => onToggle(modelKey, e.target.checked)}
            slotProps={{ input: { 'aria-label': `Enable ${modelSettings.name}` } }}
            sx={{ mt: 0.5 }}
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
            <FormControl size="small" fullWidth>
              <Select
                value={effectiveValue}
                disabled={!modelSettings.enabled}
                onChange={e => onChangeVersion(modelKey, e.target.value as string)}
                MenuProps={{ disablePortal: true }}
              >
                {options.map(v => (
                  <MenuItem key={v} value={v}>{v}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              disabled={!modelSettings.enabled}
              fullWidth
              size="small"
              value={modelSettings.apiKey}
              onChange={e => onChangeKey(modelKey, e.target.value)}
              placeholder={`Enter ${modelSettings.name} API Key`}
              type="password"
            />
          </Box>
        </Box>
      )}
    />
  );
}

const Settings: React.FC = () => {
  const id = useId();
  const viewModel = useViewModel('settings');
  const { general, llm } = viewModel.state;

  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(general);
  const [llmSettings, setLlmSettings] = useState<LlmSettings>(llm);

  useEffect(() => {
    viewModel.load();
  }, []);

  const handleGeneralChange = (key: keyof GeneralSettings, value: string | number): void => {
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
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disablePortal
      sx={{ '& .MuiDialog-paper': { zIndex: 9998, maxHeight: '90vh' } }}
    >
      <DialogContent sx={{ overflow: 'auto' }}>
        {/* Header */}
        <Grid size="grow">
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Settings
          </Typography>
        </Grid>

        {/* General Settings */}
        <Grid container spacing={0.5}>

          {/* Volume Slider */}
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
                />
              )}
            />
          </Grid>

          {/* Highlight Color Picker */}
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

          {/* Braille Display Size Input */}
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

          {/* Min Frequency Input */}
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

          {/* Max Frequency Input */}
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

          {/* Autoplay Duration Input */}
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

          {/* Aria Mode Radio */}
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
                  modelSettings={model as LlmModelSettings<typeof modelKey>}
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
                    MenuProps={{ disablePortal: true }}
                  >
                    <MenuItem value="basic">Basic</MenuItem>
                    <MenuItem value="intermediate">Intermediate</MenuItem>
                    <MenuItem value="advanced">Advanced</MenuItem>
                  </Select>
                </FormControl>
              )}
            />
          </Grid>

          {/* Custom Instructions */}
          <Grid size={12}>
            <SettingRow
              label="Custom Instructions"
              alignLabel="flex-start"
              input={(
                <TextareaAutosize
                  value={llmSettings.customInstruction}
                  onChange={e => handleLlmChange('customInstruction', e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: 8,
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    resize: 'vertical',
                  }}
                  placeholder="Enter custom instruction..."
                />
              )}
            />
          </Grid>
        </Grid>

        <Grid size={12}>
          <Divider sx={{ py: 0.5 }} />
        </Grid>
      </DialogContent>

      {/* Footer Actions */}
      <Grid
        container
        component={DialogActions}
        sx={{ alignItems: 'center' }}
      >
        <Grid
          size="auto"
          sx={{ px: 1 }}
        >
          <Button variant="text" color="inherit" onClick={handleReset}>
            Reset
          </Button>
        </Grid>
        <Grid
          size="grow"
          container
          spacing={1}
          justifyContent="flex-end"
          sx={{ px: 2, py: 1, display: 'flex', gap: 1 }}
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
