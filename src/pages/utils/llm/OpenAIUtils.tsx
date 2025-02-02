export interface OpenAIResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

export const formatOpenAIRequest = (
  message: string,
  maidrJson: string,
  image: string,
  currentPositionText: string,
  customInstruction: string
): string => {
  return JSON.stringify({
    model: 'gpt-4o-2024-11-20',
    max_tokens: 1000,
    messages: [
      {
        role: 'system',
        content:
          'You are a helpful assistant describing the chart to a blind person. ',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Describe this chart to a blind person who has a basic understanding of statistical charts.' +
              '\n' +
              customInstruction +
              '\nHere is a chart in image format and raw data in json format: \n' +
              maidrJson +
              '\nAlso currently this point is selected: ' +
              currentPositionText +
              '\n. My question is: ' +
              message,
          },
          {
            type: 'image_url',
            image_url: {
              url: image,
            },
          },
        ],
      },
    ],
  });
};

export const makeOpenAIRequest = async (
  payload: BodyInit,
  apiKey: string
): Promise<Response> => {
  const apiUrl = 'https://api.openai.com/v1/chat/completions';

  try {
    const response = fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: payload,
    });

    return response;
  } catch (error) {
    console.error('Error making API call:', error);
    return Promise.reject(new Error('Error making API call'));
  }
};

export const formatOpenAIResponse = (response: OpenAIResponse): string => {
  if (response.choices.length > 0) {
    return response.choices[0].message.content;
  }
  throw new Error('Invalid response format');
};
