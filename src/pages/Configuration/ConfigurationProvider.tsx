/* eslint-disable @typescript-eslint/no-explicit-any */
import React, {createContext, useContext, useState, ReactNode} from 'react';
import {APIHandler} from '../utils/api/APIHandlers';

interface ConfigurationContextProps {
  config: Record<string, any>;
  setConfig: (config: Record<string, any>) => void;
  verifyEmail: (email: string) => Promise<any>;
}

const ConfigurationContext = createContext<
  ConfigurationContextProps | undefined
>(undefined);

export const ConfigurationProvider: React.FC<{children: ReactNode}> = ({
  children,
}) => {
  const [config, setConfig] = useState<Record<string, any>>({});

  const verifyEmail = async (email: string): Promise<Response> => {
    return APIHandler.post('send_email', JSON.stringify({email: email}));
  };

  return (
    <ConfigurationContext.Provider value={{config, setConfig, verifyEmail}}>
      {children}
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
