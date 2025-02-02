export interface GeminiResponse {
  candidates: {
    content: {
      parts: {
        text: string;
      }[];
    };
  }[];
}

export const formatGeminiRequest = (
  message: string,
  maidrJson: string,
  image: string,
  currentPositionText: string,
  customInstruction: string
): string => {
  return JSON.stringify({
    generationConfig: {},
    safetySettings: [],
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'You are a helpful assistant describing the chart to a blind person. ',
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            text:
              'You are a helpful assistant describing the chart to a blind person.' +
              '\n' +
              customInstruction +
              '\n\nDescribe this chart to a blind person who has a basic understanding of statistical charts. Here is a chart in image format and raw data in json format: ' +
              maidrJson,
          },
          {
            inlineData: {
              data: image.split(',')[1],
              mimeType: 'image/svg+xml',
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            text:
              "Here is the current position in the chart; no response necessarily needed, use this info only if it's relevant to future questions: " +
              currentPositionText +
              '\n. My question is: ' +
              message,
          },
        ],
      },
    ],
  });
};

export const formatGeminiResponse = (response: GeminiResponse): string => {
  if (response.candidates.length > 0) {
    return response.candidates[0].content.parts[0].text;
  }
  throw new Error('Invalid response format');
};

export const makeGeminiRequest = (
  payload: BodyInit,
  apiKey: string
): Promise<Response> => {
  const apiUrl =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' +
    apiKey;

  try {
    const response = fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload,
    });

    return response;
  } catch (error) {
    console.error('Error making API call:', error);
    return Promise.reject(new Error('Error making API call'));
  }
};
