import type { AriaMode, GeneralSettings, Settings as SettingsType } from '@type/settings';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useAppDispatch, useAppSelector } from '@redux/hook/useStore';
import { loadSettings, saveSettings, toggleSettings } from '@redux/slice/settingsSlice';
import React, { useEffect, useState } from 'react';

const Settings: React.FC = () => {
  const dispatch = useAppDispatch();
  const reduxSettings = useAppSelector(state => state.settings);
  const [localSettings, setLocalSettings] = useState<SettingsType>(reduxSettings);

  useEffect(() => {
    dispatch(loadSettings());
  }, [dispatch]);

  const handleChange = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]): void => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = (): void => {
    dispatch(saveSettings(localSettings));
    dispatch(toggleSettings());
  };

  const handleClose = (): void => {
    dispatch(toggleSettings());
  };

  return (
    <Dialog
      role="dialog"
      open={reduxSettings.enabled}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      disablePortal
    >
      <DialogTitle>Settings</DialogTitle>
      <DialogContent>
        <Typography variant="h6" gutterBottom>General Settings</Typography>

        <TableContainer component={Paper}>
          <Table aria-label="General settings table">
            <TableBody>
              {/* Volume */}
              <TableRow>
                <TableCell component="th" scope="row">Volume</TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    value={localSettings.general.volume}
                    onChange={e => handleChange('volume', Number(e.target.value))}
                    inputProps={{ min: 0, max: 100 }}
                  />
                </TableCell>
              </TableRow>

              {/* Outline Color */}
              <TableRow>
                <TableCell component="th" scope="row">Outline Color</TableCell>
                <TableCell>
                  <TextField
                    type="color"
                    value={localSettings.general.highlightColor}
                    onChange={e => handleChange('highlightColor', e.target.value)}
                    sx={{ width: 80 }}
                  />
                </TableCell>
              </TableRow>

              {/* Braille Display Size */}
              <TableRow>
                <TableCell component="th" scope="row">Braille Display Size</TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    value={localSettings.general.brailleDisplaySize}
                    onChange={e => handleChange('brailleDisplaySize', Number(e.target.value))}
                    inputProps={{ min: 100, max: 500 }}
                  />
                </TableCell>
              </TableRow>

              {/* Frequency Range */}
              <TableRow>
                <TableCell component="th" scope="row">Min Frequency (Hz)</TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    value={localSettings.general.minFrequency}
                    onChange={e => handleChange('minFrequency', Number(e.target.value))}
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell component="th" scope="row">Max Frequency (Hz)</TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    value={localSettings.general.maxFrequency}
                    onChange={e => handleChange('maxFrequency', Number(e.target.value))}
                  />
                </TableCell>
              </TableRow>

              {/* Autoplay Duration */}
              <TableRow>
                <TableCell component="th" scope="row">Autoplay Duration (ms)</TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    value={localSettings.general.autoplayDuration}
                    onChange={e => handleChange('autoplayDuration', Number(e.target.value))}
                  />
                </TableCell>
              </TableRow>

              {/* ARIA Mode */}
              <TableRow>
                <TableCell component="th" scope="row">ARIA Mode</TableCell>
                <TableCell>
                  <FormControl fullWidth>
                    <InputLabel>ARIA Mode</InputLabel>
                    <Select
                      value={localSettings.general.ariaMode}
                      onChange={e => handleChange('ariaMode', e.target.value as AriaMode)}
                      label="ARIA Mode"
                    >
                      <MenuItem value="assertive">Assertive</MenuItem>
                      <MenuItem value="polite">Polite</MenuItem>
                    </Select>
                  </FormControl>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          Save & Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default Settings;
