export const formatGeminiRequest = (
  message: string,
  maidrJson: string,
  image: string,
  currentPositionText: string
) => {
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
              'You are a helpful assistant describing the chart to a blind person. \n\nDescribe this chart to a blind person who has a basic understanding of statistical charts. Here is a chart in image format and raw data in json format: ' +
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const formatGeminiResponse = (response: any) => {
  return response.candidates[0].content.parts[0].text;
};
