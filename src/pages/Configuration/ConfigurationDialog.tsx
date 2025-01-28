import React, {useState} from 'react';
import {
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from '@mui/material';

export const ConfigurationDialog: React.FC = () => {
  const [open, setOpen] = useState(true);
  const [config, setConfig] = useState({
    gemini: false,
    openai: false,
    claude: false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const {name, checked} = e.target;
    const selectedCount = Object.values(config).filter(value => value).length;

    if (checked && selectedCount >= 2) {
      alert('You can select up to 2 models only.');
      return;
    }

    setConfig(prevConfig => ({
      ...prevConfig,
      [name]: checked,
    }));
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSave = () => {
    setOpen(false);
  };

  return (
    <div>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <Container style={{padding: '25px'}}>
          <Typography variant="h6" gutterBottom>
            LLM Settings
          </Typography>
          <Typography>
            Select upto 2 models to use for generating responses.
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={config.gemini}
                onChange={handleChange}
                name="gemini"
              />
            }
            label="Gemini"
          />
          <FormControlLabel
            control={
              <Switch
                checked={config.openai}
                onChange={handleChange}
                name="openai"
              />
            }
            label="OpenAI"
          />
          <FormControlLabel
            control={
              <Switch
                checked={config.claude}
                onChange={handleChange}
                name="claude"
              />
            }
            label="Claude"
          />
        </Container>
        <Box
          display="flex"
          flexDirection="column"
          gap={2}
          style={{paddingInline: '25px', paddingBottom: '25px'}}
        >
          <TextField
            placeholder="Email Authentication"
            variant="outlined"
            fullWidth
            size="small"
          />
          {config.openai && (
            <TextField
              placeholder="OpenAI API Key"
              variant="outlined"
              fullWidth
              size="small"
            />
          )}
          {config.gemini && (
            <TextField
              placeholder="Gemini API Key"
              variant="outlined"
              fullWidth
              size="small"
            />
          )}
          {config.claude && (
            <TextField
              placeholder="Claude API Key"
              variant="outlined"
              fullWidth
              size="small"
            />
          )}
        </Box>
        <Container style={{paddingInline: '25px', paddingBottom: '25px'}}>
          <TextField
            id="standard-multiline-static"
            placeholder="Custom instructions for the chat response"
            multiline
            rows={4}
            variant="outlined"
            fullWidth
          />
        </Container>
        <DialogActions>
          <Button onClick={handleClose} color="primary">
            Close
          </Button>
          <Button onClick={handleSave} variant="contained" color="primary">
            Save & Close
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default ConfigurationDialog;
