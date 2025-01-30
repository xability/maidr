export const formatClaudeRequest = (
  message: string,
  maidrJson: string,
  image: string,
  currentPositionText: string
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
              'You are a helpful assistant describing the chart to a blind person. \n\n Here is the raw data in json format:' +
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

export const formatClaudeResponse = (response: any) => {
  return response.content[0].text;
};
