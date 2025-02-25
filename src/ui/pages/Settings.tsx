import type { AriaMode, GeneralSettings, LlmSettings } from '@type/settings';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid2,
  Radio,
  RadioGroup,
  Slider,
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

  const handleGeneralChange = (key: keyof GeneralSettings, value: string | number): void => {
    setGeneralSettings(prev => ({
      ...prev,
      [key]: value,
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
      {/* Header */}
      <Grid2
        container
        component={DialogTitle}
      >
        <Grid2 size="grow">
          <Typography variant="h6" fontWeight="bold">
            Settings
          </Typography>
        </Grid2>
      </Grid2>

      <DialogContent sx={{ overflow: 'visible' }}>
        {/* General Settings */}
        <Grid2 container spacing={0.5}>
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
