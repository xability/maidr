/**
 * Chat suggestion for user prompts including follow-up questions, clarifications, or analysis requests.
 */
export interface Suggestion {
  id: string;
  text: string;
  type: 'followup' | 'clarification' | 'analysis';
}
