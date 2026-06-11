import type { DisplayService } from '@service/display';
import type { TextService } from '@service/text';
import type { Maidr } from '@type/grammar';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
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

describe('chatService data serialization', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('getDataJson serializes the initial chart data', () => {
    const initial = createMaidr(1);
    const service = createChatService(initial);

    expect(service.getDataJson()).toBe(JSON.stringify(initial));
  });

  test('updateData refreshes the chart data shared with LLM providers', () => {
    const service = createChatService(createMaidr(1));
    const updated = createMaidr(42);

    service.updateData(updated);

    expect(service.getDataJson()).toBe(JSON.stringify(updated));
  });

  test('serialization is lazy: streaming updates do not stringify', () => {
    const initial = createMaidr(1);
    const service = createChatService(initial);
    const spy = jest.spyOn(JSON, 'stringify');

    for (let i = 0; i < 10; i++) {
      service.updateData(createMaidr(i));
    }

    const chartCalls = spy.mock.calls.filter(
      call => (call[0] as Maidr | undefined)?.id === 'chat-chart',
    );
    expect(chartCalls).toHaveLength(0);
  });

  test('serialization is cached across repeated reads', () => {
    const service = createChatService(createMaidr(1));
    const spy = jest.spyOn(JSON, 'stringify');

    service.getDataJson();
    service.getDataJson();

    const chartCalls = spy.mock.calls.filter(
      call => (call[0] as Maidr | undefined)?.id === 'chat-chart',
    );
    expect(chartCalls).toHaveLength(1);
  });
});
