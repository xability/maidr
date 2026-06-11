import type { DisplayService } from '@service/display';
import type { TextService } from '@service/text';
import type { Maidr } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { ChatService } from '@service/chat';
import { TraceType } from '@type/grammar';

/**
 * Creates a minimal Maidr config with a single bar point.
 * @param y - The y value of the single data point
 * @returns A Maidr config
 */
function createMaidr(y: number): Maidr {
  return {
    id: 'chat-chart',
    title: 'Chat test chart',
    subplots: [[
      {
        layers: [
          {
            id: 'layer-0',
            type: TraceType.BAR,
            axes: { x: { label: 'X' }, y: { label: 'Y' } },
            data: [{ x: 'A', y }],
          },
        ],
      },
    ]],
  };
}

/**
 * Creates a ChatService with stubbed collaborators.
 * @param maidr - The initial chart data
 * @returns The service under test
 */
function createChatService(maidr: Maidr): ChatService {
  const display = { plot: {} } as unknown as DisplayService;
  const textService = {} as unknown as TextService;
  return new ChatService(display, textService, maidr);
}

/**
 * Reads the serialized chart data held by each LLM model of a ChatService.
 * @param service - The chat service
 * @returns The JSON strings keyed by provider
 */
function getModelJson(service: ChatService): Record<string, string> {
  const models = (service as unknown as { models: Record<string, { json: string }> }).models;
  return Object.fromEntries(
    Object.entries(models).map(([name, model]) => [name, model.json]),
  );
}

describe('chatService.updateData', () => {
  test('models start with the initial chart data', () => {
    const initial = createMaidr(1);
    const service = createChatService(initial);

    const json = getModelJson(service);
    for (const value of Object.values(json)) {
      expect(value).toBe(JSON.stringify(initial));
    }
  });

  test('updateData refreshes the chart data used by every LLM model', () => {
    const service = createChatService(createMaidr(1));
    const updated = createMaidr(42);

    service.updateData(updated);

    const json = getModelJson(service);
    expect(Object.keys(json)).toEqual(
      expect.arrayContaining(['OPENAI', 'ANTHROPIC_CLAUDE', 'GOOGLE_GEMINI']),
    );
    for (const value of Object.values(json)) {
      expect(value).toBe(JSON.stringify(updated));
    }
  });
});
