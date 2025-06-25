export interface Suggestion {
  id: string;
  text: string;
  type: 'followup' | 'clarification' | 'analysis';
}
