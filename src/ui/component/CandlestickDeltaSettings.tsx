import type { CandlestickDeltaField } from '@model/candlestickDelta';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  MenuItem,
  Select,
  Typography,
} from '@mui/material';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import React, { useId, useState } from 'react';

/**
 * The F7 dialog for the candlestick reference comparison: the user picks a
 * reference line (e.g. a moving average series) and the OHLC value to
 * compare, then OK activates the virtual delta layer. ESC/Cancel closes the
 * dialog without changing anything (ESC is handled by the
 * CANDLESTICK_DELTA_SETTINGS keybinding scope).
 */
const CandlestickDeltaSettings: React.FC = () => {
  const viewModel = useViewModel('candlestickDelta');
  const state = useViewModelState('candlestickDelta');

  const titleId = useId();
  const descriptionId = useId();
  const referenceLabelId = useId();
  const fieldLabelId = useId();

  const [referenceId, setReferenceId] = useState(state.initialReferenceId);
  const [field, setField] = useState<CandlestickDeltaField>(state.initialField);

  if (!state.visible || state.references.length === 0) {
    return null;
  }

  const handleOk = (): void => {
    viewModel.confirm(referenceId, field);
  };

  const handleCancel = (): void => {
    viewModel.cancel();
  };

  return (
    <Dialog
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      open={true}
      maxWidth="xs"
      fullWidth
      disablePortal
      disableEnforceFocus
      onClick={e => e.stopPropagation()}
      // Focus sits inside the dialog (autoFocus on the first Select), so MUI
      // swallows the Escape keydown before the scope keybinding can see it.
      // Route MUI's own escape/backdrop-close through the cancel path instead.
      onClose={handleCancel}
    >
      <DialogContent>
        <Typography id={titleId} variant="h6" component="h2" fontWeight="bold" gutterBottom>
          Compare to Reference Line
        </Typography>
        <Typography id={descriptionId} variant="body2" color="text.secondary" gutterBottom>
          Explore how far each candle sits above or below a reference line.
          Pick the reference and the price value to compare, then press OK.
        </Typography>

        <Typography id={referenceLabelId} variant="body2" sx={{ mt: 2, mb: 0.5 }}>
          Reference data
        </Typography>
        <FormControl fullWidth>
          <Select
            value={referenceId}
            onChange={e => setReferenceId(e.target.value)}
            MenuProps={{ disablePortal: true }}
            inputProps={{ 'aria-labelledby': referenceLabelId }}
            autoFocus
            size="small"
          >
            {state.references.map(reference => (
              <MenuItem key={reference.id} value={reference.id}>
                {reference.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Typography id={fieldLabelId} variant="body2" sx={{ mt: 2, mb: 0.5 }}>
          Value to compare
        </Typography>
        <FormControl fullWidth>
          <Select
            value={field}
            onChange={e => setField(e.target.value as CandlestickDeltaField)}
            MenuProps={{ disablePortal: true }}
            inputProps={{ 'aria-labelledby': fieldLabelId }}
            size="small"
          >
            {state.fields.map(fieldOption => (
              <MenuItem key={fieldOption} value={fieldOption}>
                {fieldOption}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>

      <DialogActions>
        <Button
          variant="outlined"
          color="inherit"
          onClick={handleCancel}
          aria-label="Cancel and close without comparing"
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleOk}
          aria-label="Activate the reference comparison layer"
        >
          Okay
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CandlestickDeltaSettings;
