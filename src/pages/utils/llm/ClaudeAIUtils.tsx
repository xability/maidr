export interface ClaudeResponse {
  content: {text: string}[];
}
export const formatClaudeRequest = (
  message: string,
  maidrJson: string,
  image: string,
  currentPositionText: string,
  customInstruction: string
) => {
  return JSON.stringify({
    anthropic_version: 'vertex-2023-10-16',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: image.split(',')[1],
            },
          },
          {
            type: 'text',
            text:
              'You are a helpful assistant describing the chart to a blind person.' +
              '\n' +
              customInstruction +
              '\n' +
              'Here is the raw data in json format:' +
              maidrJson +
              '\n\n\n' +
              'Here is the current position in the chart; no response necessarily needed, use this info only if its relevant to future questions: ' +
              currentPositionText +
              '. My question is: ' +
              message,
          },
        ],
      },
    ],
  });
};

export const formatClaudeResponse = (response: ClaudeResponse): string => {
  if (response.content.length > 0) {
    return response.content[0].text;
  }
  throw new Error('Invalid response format');
};
