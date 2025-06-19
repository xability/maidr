import type { Llm, LlmVersion } from '@type/llm';
import { Box, FormControl, MenuItem, Select, Typography } from '@mui/material';
import { useViewModel } from '@state/hook/useViewModel';
import { MODEL_VERSIONS } from '@ui/pages/Settings';
import React from 'react';

interface ModelSelectionProps {
  enabledModels: Array<{
    modelKey: Llm;
    name: string;
    version: string;
  }>;
}

export const ModelSelection: React.FC<ModelSelectionProps> = ({ enabledModels }) => {
  const settingsViewModel = useViewModel('settings');
  const chatViewModel = useViewModel('chat');
  const currentSettings = settingsViewModel.state;

  const handleModelChange = (modelKey: Llm, version: LlmVersion): void => {
    // Get the latest settings state
    const latestSettings = settingsViewModel.state;
    const updatedSettings = {
      ...latestSettings,
      llm: {
        ...latestSettings.llm,
        models: {
          ...latestSettings.llm.models,
          [modelKey]: {
            ...latestSettings.llm.models[modelKey],
            version,
            enabled: true,
          },
        },
      },
    };
    // The spread operator already creates a proper immutable update
    settingsViewModel.saveSettings(updatedSettings);
    // Reload the welcome message to reflect the new model version
    chatViewModel.loadInitialMessage();
  };

  const getModelVersions = (modelKey: Llm): { label: string; value: LlmVersion }[] => {
    const config = MODEL_VERSIONS[modelKey];
    const labels = config.labels as Record<string, string>;
    return config.options.map((version) => {
      const typedVersion = version as LlmVersion;
      return {
        label: labels[typedVersion],
        value: typedVersion,
      };
    });
  };
  const getCurrentVersion = (modelKey: Llm): LlmVersion => {
    const config = MODEL_VERSIONS[modelKey];
    const currentVersion = currentSettings.llm.models[modelKey].version;
    const validOptions = config.options as readonly LlmVersion[];
    if (!currentVersion || !validOptions.includes(currentVersion as LlmVersion)) {
      return config.default;
    }
    return currentVersion as LlmVersion;
  };

  return (
    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {enabledModels.map(model => (
        <Box key={model.modelKey} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ minWidth: 100 }}>
            {model.name}
            :
          </Typography>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <Select
              value={getCurrentVersion(model.modelKey)}
              onChange={e => handleModelChange(model.modelKey, e.target.value as LlmVersion)}
              aria-label={`Select ${model.name} version`}
              MenuProps={{
                disablePortal: true,
                PaperProps: {
                  sx: {
                    maxHeight: 200,
                  },
                },
              }}
            >
              {getModelVersions(model.modelKey).map(version => (
                <MenuItem key={version.value} value={version.value}>
                  {version.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      ))}
    </Box>
  );
};
