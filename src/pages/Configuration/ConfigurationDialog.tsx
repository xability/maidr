import React, {useEffect, useState} from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import {useConfiguration} from './ConfigurationProvider';
import {APIHandler} from '../utils/api/APIHandlers';
import {Configuration} from '../types/ConfigurationTypes';

export const ConfigurationDialog: React.FC = () => {
  const [open, setOpen] = useState(true);
  const [currentConfig, setCurrentConfig] = useState<Configuration>({
    models: {
      gemini: false,
      openai: false,
      claude: false,
    },
    openAIAPIKey: '',
    geminiAPIKey: '',
    claudeAPIKey: '',
    clientToken: '',
  });
  const [email, setEmail] = useState('');
  const {config, setConfigurations, verifyEmail} = useConfiguration();
  const [isLoading, setIsLoading] = useState(false);
  const [emailDisabled, setEmailDisabled] = useState(false);
  const [openAIKey, setOpenAIKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [claudeKey, setClaudeKey] = useState('');
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  useEffect(() => {
    const savedConfig = localStorage.getItem('config');
    if (savedConfig) {
      const currentConfig = JSON.parse(savedConfig);
      setCurrentConfig(currentConfig);
      setOpenAIKey(currentConfig.openAIAPIKey);
      setGeminiKey(currentConfig.geminiAPIKey);
      setClaudeKey(currentConfig.claudeAPIKey);
    }
    setIsConfigLoaded(true);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const {name, checked} = e.target;
    const selectedCount = Object.values(currentConfig.models).filter(
      value => value
    ).length;

    if (checked && selectedCount >= 2) {
      alert('You can select up to 2 models only.');
      return;
    }
    const models = {...currentConfig.models, [name]: checked};

    setCurrentConfig(prevConfig => ({
      ...prevConfig,
      models,
    }));
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSave = () => {
    currentConfig.openAIAPIKey = openAIKey;
    currentConfig.geminiAPIKey = geminiKey;
    currentConfig.claudeAPIKey = claudeKey;
    setConfigurations(currentConfig);
    setOpen(false);
  };

  const handleVerify = () => {
    setIsLoading(true);
    setEmailDisabled(true);
    verifyEmail(email).then(async response => {
      if (response.status === 200) {
        const responseData = await response.json();
        config.clientToken = responseData.client_token;
        const headers = APIHandler.headers;
        headers.Authorization = `${email} ${responseData.client_token}`;
        APIHandler.setHeaders(headers);
        setIsLoading(false);
        alert(responseData.message);
      } else {
        setIsLoading(false);
        setEmailDisabled(false);
        alert('Email verification failed');
      }
    });
  };

  const handleClearEmail = () => {
    setEmailDisabled(false);
    setEmail('');
  };

  return (
    <div>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        {!isConfigLoaded && (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            width="100%"
            height="500px"
          >
            <CircularProgress />
          </Box>
        )}
        {isConfigLoaded && (
          <Box>
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
                    checked={currentConfig.models.gemini}
                    onChange={handleChange}
                    name="gemini"
                  />
                }
                label="Gemini"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={currentConfig.models.openai}
                    onChange={handleChange}
                    name="openai"
                  />
                }
                label="OpenAI"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={currentConfig.models.claude}
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
              <Box display="flex" flexDirection="row" gap={2}>
                <TextField
                  placeholder="Email Authentication"
                  variant="outlined"
                  fullWidth
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  size="small"
                  disabled={emailDisabled}
                />
                {isLoading && (
                  <Typography>
                    <CircularProgress />
                  </Typography>
                )}
                {!isLoading &&
                  (!emailDisabled ? (
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleVerify}
                    >
                      Verify
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      color="error"
                      onClick={handleClearEmail}
                    >
                      Clear
                    </Button>
                  ))}
              </Box>
              {currentConfig.models.openai && (
                <TextField
                  placeholder="OpenAI API Key"
                  variant="outlined"
                  fullWidth
                  size="small"
                  value={openAIKey}
                  type="password"
                  onChange={e => setOpenAIKey(e.target.value)}
                />
              )}
              {currentConfig.models.gemini && (
                <TextField
                  placeholder="Gemini API Key"
                  variant="outlined"
                  fullWidth
                  size="small"
                  value={geminiKey}
                  type="password"
                  onChange={e => setGeminiKey(e.target.value)}
                />
              )}
              {currentConfig.models.claude && (
                <TextField
                  placeholder="Claude API Key"
                  variant="outlined"
                  fullWidth
                  size="small"
                  value={claudeKey}
                  type="password"
                  onChange={e => setClaudeKey(e.target.value)}
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
          </Box>
        )}
      </Dialog>
    </div>
  );
};

export default ConfigurationDialog;
