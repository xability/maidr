import React, {createContext, useContext, useState} from 'react';
import {LLM} from '../../types/LLMTypes';

interface LLMContextProps {
  currentLLM: string;
  setCurrentLLM: (llm: LLM) => void;
  sendMessage: (llm: LLM, message: string) => Promise<string | null>;
}

const LLMContext = createContext<LLMContextProps | undefined>(undefined);

export const LLMProvider: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  const [currentLLM, setCurrentLLM] = useState<LLM>(LLM.GPT4o);

  const sendMessage = async (
    llm: string,
    message: string
  ): Promise<string | null> => {
    try {
      const response = await fetch(`https://your-backend-api.com/${llm}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({text: message}),
      });

      const data = await response.json();
      return data.reply; // Adjust based on API response
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
