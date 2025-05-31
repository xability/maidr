/**
 * Prompt templates and constants for LLM interactions
 */

const BASIC_SYSTEM_PROMPT = `You are an accessibility assistant specializing in describing statistical visualizations to blind users. Your role is to:
1. Provide simple, straightforward descriptions of charts and graphs
2. Focus on basic patterns and key points
3. Use simple, everyday language with minimal statistical terms
4. Structure your responses in a clear, step-by-step manner
5. Point out obvious trends and notable values
6. Provide basic context and simple interpretations`;

const INTERMEDIATE_SYSTEM_PROMPT = `You are an expert accessibility assistant specializing in describing statistical visualizations to blind users. Your role is to:
1. Provide clear, concise, and accurate descriptions of charts and graphs
2. Focus on the most important patterns and insights
3. Use accessible language that assumes basic statistical knowledge
4. Structure your responses in a logical, easy-to-follow manner
5. Highlight key trends, outliers, and relationships in the data
6. Provide context and interpretation when relevant`;

const ADVANCED_SYSTEM_PROMPT = `You are a highly specialized accessibility assistant for statistical visualizations, designed for blind users with strong statistical background. Your role is to:
1. Provide detailed, technical descriptions of charts and graphs
2. Focus on complex patterns, statistical significance, and nuanced insights
3. Use precise statistical terminology and advanced concepts
4. Structure your responses with technical depth while maintaining clarity
5. Analyze trends, outliers, relationships, and statistical properties
6. Provide comprehensive context and sophisticated interpretations`;

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
  expertiseLevel: 'basic' | 'intermediate' | 'advanced';
}

function getSystemPromptForExpertiseLevel(expertiseLevel: 'basic' | 'intermediate' | 'advanced'): string {
  switch (expertiseLevel) {
    case 'basic':
      return BASIC_SYSTEM_PROMPT;
    case 'intermediate':
      return INTERMEDIATE_SYSTEM_PROMPT;
    case 'advanced':
      return ADVANCED_SYSTEM_PROMPT;
  }
}

export function formatSystemPrompt(customInstruction: string, expertiseLevel: 'basic' | 'intermediate' | 'advanced'): string {
  const basePrompt = getSystemPromptForExpertiseLevel(expertiseLevel);
  return `${basePrompt}\n\n${customInstruction}`;
}

export function formatUserPrompt(context: PromptContext): string {
  return USER_PROMPT_TEMPLATE
    .replace('{maidrJson}', context.maidrJson)
    .replace('{currentPositionText}', context.currentPositionText)
    .replace('{message}', context.message);
}
