import type { Llm, LlmVersion } from '@type/llm';
import { Box, FormControl, MenuItem, Select, Typography } from '@mui/material';
import { MODEL_VERSIONS } from '@service/modelVersions';
import { useOllamaModels } from '@state/hook/useOllamaModels';
import { useViewModel } from '@state/hook/useViewModel';
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

  // Probe the local Ollama server for installed models so the dropdown
  // offers what the user actually has pulled, not just curated suggestions.
  const ollamaEnabled = enabledModels.some(model => model.modelKey === 'OLLAMA');
  const ollamaModels = useOllamaModels(
    ollamaEnabled ? currentSettings.llm.models.OLLAMA.apiKey : null,
  );

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
    // Update the welcome message to reflect the new model version
    chatViewModel.updateWelcomeMessage();
  };

  const getCurrentVersion = (modelKey: Llm): LlmVersion => {
    const config = MODEL_VERSIONS[modelKey];
    const currentVersion = currentSettings.llm.models[modelKey].version;
    // Ollama models are whatever the user has pulled locally, so any
    // non-empty name is valid even outside the curated suggestion list.
    if (modelKey === 'OLLAMA' && currentVersion?.trim()) {
      return currentVersion as LlmVersion;
    }
    const validOptions = config.options as readonly LlmVersion[];
    if (!currentVersion || !validOptions.includes(currentVersion as LlmVersion)) {
      return config.default;
    }
    return currentVersion as LlmVersion;
  };

  const getModelVersions = (modelKey: Llm): { label: string; value: LlmVersion }[] => {
    const config = MODEL_VERSIONS[modelKey];
    const labels = config.labels as Record<string, string>;

    let options: readonly string[] = config.options;
    if (modelKey === 'OLLAMA') {
      if (ollamaModels.length > 0) {
        options = ollamaModels;
      }
      // Keep the saved model selectable even when it is missing from the
      // probed list (e.g. it was removed locally), so the Select always has
      // a matching option for its current value.
      const currentVersion = getCurrentVersion(modelKey);
      if (!options.includes(currentVersion)) {
        options = [...options, currentVersion];
      }
    }

    return options.map((version) => {
      const typedVersion = version as LlmVersion;
      return {
        label: labels[typedVersion] ?? typedVersion,
        value: typedVersion,
      };
    });
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
