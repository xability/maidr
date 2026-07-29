import type { Llm, LlmVersion } from '@type/llm';
import { Box, FormControl, MenuItem, Select, Typography } from '@mui/material';
import { getValidVersion, MODEL_VERSIONS } from '@service/modelVersions';
import { useModalContainer } from '@state/hook/useModalContainer';
import { useOllamaModels } from '@state/hook/useOllamaModels';
import { useViewModel } from '@state/hook/useViewModel';
import { resolveVersionOptions } from '@util/llm';
import React from 'react';

interface ModelSelectionProps {
  enabledModels: Array<{
    modelKey: Llm;
    name: string;
    version: string;
  }>;
}

interface ModelVersionSelectProps {
  label: string;
  value: LlmVersion;
  versions: { label: string; value: LlmVersion }[];
  onChange: (version: LlmVersion) => void;
}

/**
 * One provider's version dropdown. Split out of the list so each dropdown owns
 * the {@link useModalContainer} ref its own menu needs — one hook per menu.
 */
const ModelVersionSelect: React.FC<ModelVersionSelectProps> = ({
  label,
  value,
  versions,
  onChange,
}) => {
  const { modalRef, container } = useModalContainer();

  return (
    <FormControl size="small" sx={{ minWidth: 200 }}>
      <Select
        value={value}
        onChange={e => onChange(e.target.value as LlmVersion)}
        aria-label={label}
        MenuProps={{
          disablePortal: true,
          ref: modalRef,
          container,
          PaperProps: {
            sx: {
              maxHeight: 200,
            },
          },
        }}
      >
        {versions.map(version => (
          <MenuItem key={version.value} value={version.value}>
            {version.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

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

  const getCurrentVersion = (modelKey: Llm): LlmVersion =>
    getValidVersion(modelKey, currentSettings.llm.models[modelKey].version);

  const getModelVersions = (modelKey: Llm): { label: string; value: LlmVersion }[] => {
    const config = MODEL_VERSIONS[modelKey];
    const labels = config.labels as Record<string, string>;

    // Live model lists are probed in the settings dialog; here only the local
    // Ollama list is fetched (cloud lists would cost an API call per chat
    // open). The saved version is always kept selectable either way.
    const options: readonly string[] = resolveVersionOptions(
      config.options,
      modelKey === 'OLLAMA' ? ollamaModels : [],
      getCurrentVersion(modelKey),
    );

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
          <ModelVersionSelect
            label={`Select ${model.name} version`}
            value={getCurrentVersion(model.modelKey)}
            versions={getModelVersions(model.modelKey)}
            onChange={version => handleModelChange(model.modelKey, version)}
          />
        </Box>
      ))}
    </Box>
  );
};
