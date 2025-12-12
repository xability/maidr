/**
 * Prompt templates and constants for LLM interactions
 */

const BASIC_SYSTEM_PROMPT = `You are a helpful assistant that answers questions about statistical visualizations. Your role is to:
1. Answer the user's specific question directly and clearly
2. Use simple, everyday language with minimal statistical terms
3. Provide relevant information from the data when needed
4. Focus on what the user is asking, not describing the entire chart
5. Give brief context only when it helps answer the question
6. Keep responses concise and to the point`;

const INTERMEDIATE_SYSTEM_PROMPT = `You are an expert assistant that answers questions about statistical visualizations. Your role is to:
1. Answer the user's specific question directly and accurately
2. Use accessible language that assumes basic statistical knowledge
3. Provide relevant insights and analysis when needed
4. Focus on what the user is asking, not describing the entire chart
5. Highlight key trends, outliers, and relationships when relevant to the question
6. Provide context and interpretation only when it helps answer the specific question`;

const ADVANCED_SYSTEM_PROMPT = `You are a highly specialized assistant that answers questions about statistical visualizations for users with strong statistical background. Your role is to:
1. Answer the user's specific question with technical depth and precision
2. Use precise statistical terminology and advanced concepts when appropriate
3. Provide detailed analysis of complex patterns and statistical significance when relevant
4. Focus on what the user is asking, not describing the entire chart
5. Analyze trends, outliers, relationships, and statistical properties when they relate to the question
6. Provide comprehensive context and sophisticated interpretations only when they help answer the specific question`;

export const USER_PROMPT_TEMPLATE = `I have a statistical visualization with the following data:

1. Raw data in JSON format: \n{maidrJson}\n
2. Current selected point: {currentPositionText}

Question: {message}

Please answer my specific question directly. If you need to reference the visualization data, do so briefly and focus on answering what I asked.`;

/**
 * Context data required for generating prompts for LLM interactions.
 */
export interface PromptContext {
  customInstruction: string;
  maidrJson: string;
  currentPositionText: string;
  message: string;
  expertiseLevel: 'basic' | 'intermediate' | 'advanced' | 'custom';
}

const SYSTEM_PROMPTS: Record<Exclude<PromptContext['expertiseLevel'], 'custom'>, string> = {
  basic: BASIC_SYSTEM_PROMPT,
  intermediate: INTERMEDIATE_SYSTEM_PROMPT,
  advanced: ADVANCED_SYSTEM_PROMPT,
};

/**
 * Selects the appropriate system prompt based on the user's expertise level.
 * @param expertiseLevel - The expertise level of the user
 * @returns The corresponding system prompt string, or empty string for custom level
 */
function selectPromptByLevel(expertiseLevel: PromptContext['expertiseLevel']): string {
  if (expertiseLevel === 'custom') {
    return '';
  }
  return SYSTEM_PROMPTS[expertiseLevel];
}

/**
 * Formats the system prompt by combining base prompt with custom instructions.
 * @param customInstruction - Additional custom instructions to append
 * @param expertiseLevel - The expertise level to determine base prompt
 * @returns The formatted system prompt string
 */
export function formatSystemPrompt(customInstruction: string, expertiseLevel: PromptContext['expertiseLevel']): string {
  if (expertiseLevel === 'custom') {
    return customInstruction;
  }
  const basePrompt = selectPromptByLevel(expertiseLevel);
  return `${basePrompt}\n\n${customInstruction}`;
}

/**
 * Formats the user prompt by replacing template placeholders with context values.
 * @param context - The prompt context containing data and message
 * @returns The formatted user prompt string
 */
export function formatUserPrompt(context: PromptContext): string {
  return USER_PROMPT_TEMPLATE
    .replace('{maidrJson}', context.maidrJson)
    .replace('{currentPositionText}', context.currentPositionText)
    .replace('{message}', context.message);
}
