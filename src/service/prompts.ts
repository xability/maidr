/**
 * Prompt templates and constants for LLM interactions
 */

export const SYSTEM_PROMPT = `You are an expert accessibility assistant specializing in describing statistical visualizations to blind users. Your role is to:
1. Provide clear, concise, and accurate descriptions of charts and graphs
2. Focus on the most important patterns and insights
3. Use accessible language that assumes basic statistical knowledge
4. Structure your responses in a logical, easy-to-follow manner
5. Highlight key trends, outliers, and relationships in the data
6. Provide context and interpretation when relevant`;

export const USER_PROMPT_TEMPLATE = `I need your help understanding this statistical visualization. Here's what I have:

1. Raw data in JSON format: \n{maidrJson}\n
2. Current selected point: {currentPositionText}

Please help me understand: {message}

Focus on providing a clear, structured response that helps me understand the key insights from this visualization.`;

export interface PromptContext {
  customInstruction: string;
  maidrJson: string;
  currentPositionText: string;
  message: string;
}

export function formatSystemPrompt(customInstruction: string): string {
  return `${SYSTEM_PROMPT}\n\n${customInstruction}`;
}

export function formatUserPrompt(context: PromptContext): string {
  return USER_PROMPT_TEMPLATE
    .replace('{maidrJson}', context.maidrJson)
    .replace('{currentPositionText}', context.currentPositionText)
    .replace('{message}', context.message);
}
