/* eslint-disable @typescript-eslint/no-explicit-any */
import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from 'react';
import {APIHandler} from '../utils/api/APIHandlers';
import {Configuration} from '../types/ConfigurationTypes';
import {CircularProgress} from '@mui/material';

interface ConfigurationContextProps {
  config: Configuration;
  setConfigurations: (config: Configuration) => void;
  verifyEmail: (email: string) => Promise<Response>;
}

const ConfigurationContext = createContext<
  ConfigurationContextProps | undefined
>(undefined);

export const ConfigurationProvider: React.FC<{children: ReactNode}> = ({
  children,
}) => {
  const [config, setConfig] = useState<Configuration>({
    models: {
      gemini: false,
      openai: false,
      claude: false,
    },
    openAIAPIKey: '',
    geminiAPIKey: '',
    claudeAPIKey: '',
    clientToken: '',
    email: '',
  });
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  useEffect(() => {
    const savedConfig = localStorage.getItem('config');
    if (savedConfig !== null && savedConfig !== '') {
      const currentConfig = JSON.parse(savedConfig) as Configuration;
      setConfig(currentConfig);

      if (currentConfig.clientToken) {
        const headers = APIHandler.headers;
        headers.Authentication = `${currentConfig.email} ${currentConfig.clientToken}`;
        APIHandler.setHeaders(headers);
      }
    }
    setIsConfigLoaded(true);
  }, []);

  const verifyEmail = async (email: string): Promise<Response> => {
    return APIHandler.post('send_email', JSON.stringify({email: email}));
  };

  const setConfigurations = (config: Configuration): void => {
    setConfig(config);
    localStorage.setItem('config', JSON.stringify(config));
  };

  return (
    <ConfigurationContext.Provider
      value={{config, setConfigurations, verifyEmail}}
    >
      {isConfigLoaded ? children : <CircularProgress />}
    </ConfigurationContext.Provider>
  );
};

export const useConfiguration = (): ConfigurationContextProps => {
  const context = useContext(ConfigurationContext);
  if (!context) {
    throw new Error(
      'useConfiguration must be used within a ConfigurationProvider'
    );
  }
  return context;
};
