import React, {createContext, useContext, useState} from 'react';
import {LLM, LLMResponse} from '../types/LLMTypes';
import {
  formatGeminiRequest,
  formatGeminiResponse,
  GeminiResponse,
  makeGeminiRequest,
} from '../utils/llm/GeminiAIUtils';
import {
  formatOpenAIRequest,
  formatOpenAIResponse,
  makeOpenAIRequest,
  OpenAIResponse,
} from '../utils/llm/OpenAIUtils';
import {
  ClaudeResponse,
  formatClaudeRequest,
  formatClaudeResponse,
} from '../utils/llm/ClaudeAIUtils';
import {APIHandler} from '../utils/api/APIHandlers';

interface LLMContextProps {
  currentLLM: string;
  setCurrentLLM: (llm: LLM) => void;
  sendMessage: (
    llm: LLM,
    message: string,
    isServer: boolean,
    customInstruction: string,
    apiKey: string
  ) => Promise<string | null>;
}

const LLMContext = createContext<LLMContextProps | undefined>(undefined);

export const LLMProvider: React.FC<{
  children: React.ReactNode;
  maidrJson: string;
  image: string;
}> = ({children, maidrJson, image}) => {
  const [currentLLM, setCurrentLLM] = useState<LLM>(LLM.Gemini);

  const sendMessage = async (
    llm: LLM,
    message: string,
    isServer = false,
    customInstruction = '',
    apiKey = ''
  ): Promise<string | null> => {
    try {
      let responseData: LLMResponse;
      if (isServer) {
        const response = await APIHandler.post(
          `${llm}`,
          formatRequest(message, maidrJson, image, customInstruction, llm)
        );
        responseData = (await response.json()) as LLMResponse;
      } else {
        const response = await makeAIModelRequest(
          llm,
          formatRequest(message, maidrJson, image, customInstruction, llm),
          apiKey
        );
        responseData = (await response?.json()) as LLMResponse;
      }
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

export const useLLM = (): LLMContextProps => {
  const context = useContext(LLMContext);
  if (!context) {
    throw new Error('useLLM must be used within an LLMProvider');
  }
  return context;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formatResponse = (response: LLMResponse, llm: LLM): string => {
  if (llm === LLM.Gemini) {
    return formatGeminiResponse(response as GeminiResponse);
  }
  if (llm === LLM.OpenAI) {
    return formatOpenAIResponse(response as OpenAIResponse);
  }
  if (llm === LLM.Claude) {
    return formatClaudeResponse(response as ClaudeResponse);
  }
  return '';
};

const formatRequest = (
  message: string,
  maidrJson: string,
  image: string,
  customInstruction: string,
  llm: LLM
): BodyInit => {
  if (llm === LLM.Gemini) {
    return formatGeminiRequest(
      message,
      maidrJson,
      image,
      '',
      customInstruction
    );
  }
  if (llm === LLM.OpenAI) {
    return formatOpenAIRequest(
      message,
      maidrJson,
      image,
      '',
      customInstruction
    );
  }
  if (llm === LLM.Claude) {
    return formatClaudeRequest(
      message,
      maidrJson,
      image,
      '',
      customInstruction
    );
  }
  return JSON.stringify({});
};

const makeAIModelRequest = async (
  llm: LLM,
  payload: BodyInit,
  apiKey: string
): Promise<Response | null> => {
  switch (llm) {
    case LLM.Gemini:
      return makeGeminiRequest(payload, apiKey);
    case LLM.OpenAI:
      return makeOpenAIRequest(payload, apiKey);
    // case LLM.Claude:
    //   return makeClaudeRequest(message);
    default:
      return null;
  }
};
