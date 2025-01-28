import React, {createContext, useContext, useState} from 'react';
import {LLM} from '../types/LLMTypes';
import {
  formatGeminiRequest,
  formatGeminiResponse,
} from '../utils/llm/GeminiAIUtils';
import {APIHandler} from '../utils/api/APIHandlers';
import {useConfiguration} from '../Configuration/ConfigurationProvider';

interface LLMContextProps {
  currentLLM: string;
  setCurrentLLM: (llm: LLM) => void;
  sendMessage: (llm: LLM, message: string) => Promise<string | null>;
}

const LLMContext = createContext<LLMContextProps | undefined>(undefined);

export const LLMProvider: React.FC<{
  children: React.ReactNode;
  maidrJson: string;
  image: string;
}> = ({children, maidrJson, image}) => {
  const [currentLLM, setCurrentLLM] = useState<LLM>(LLM.Gemini);
  const {config, setConfig} = useConfiguration();

  const sendMessage = async (
    llm: LLM,
    message: string
  ): Promise<string | null> => {
    try {
      const response = await APIHandler.post(
        `${llm}`,
        formatRequest(message, maidrJson, image, llm)
      );

      const responseData = await response.json();
      const formattedResponse = formatResponse(responseData, llm);
      return formattedResponse;
    } catch (error) {
      console.error(`Error sending message to ${llm}:`, error);
      return null;
    }
  };

  return (
    <LLMContext.Provider value={{currentLLM, setCurrentLLM, sendMessage}}>
      {children}
    </LLMContext.Provider>
  );
};

export const useLLM = () => {
  const context = useContext(LLMContext);
  if (!context) {
    throw new Error('useLLM must be used within an LLMProvider');
  }
  return context;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formatResponse = (response: any, llm: LLM) => {
  if (llm === LLM.Gemini) {
    return formatGeminiResponse(response);
  }
  return '';
};

const formatRequest = (
  message: string,
  maidrJson: string,
  image: string,
  llm: LLM
): BodyInit => {
  if (llm === LLM.Gemini) {
    return formatGeminiRequest(message, maidrJson, image, '');
  }
  return JSON.stringify({});
};
