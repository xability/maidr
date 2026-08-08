import type { DisplayService } from '@service/display';
import type { TextService } from '@service/text';
import type { Maidr } from '@type/grammar';
import { afterAll, afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { ChatService } from '@service/chat';
import { TraceType } from '@type/grammar';

// Svg.toBase64 needs DOM APIs unavailable under the node test environment;
// a fixed data URL also lets the tests assert the data-URL prefix stripping.
jest.mock('@util/svg', () => ({
  Svg: {
    toBase64: jest.fn(async () => 'data:image/jpeg;base64,QUJD'),
  },
}));

describe('ChatService provider requests', () => {
  const fetchMock = jest.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  const display = { plot: {} } as unknown as DisplayService;
  const textService = { getCoordinateText: () => 'point 1 of 10' } as unknown as TextService;
  const maidr = { id: 'plot' } as unknown as Maidr;

  beforeEach(() => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  // Restore the real fetch so the mock cannot leak into other test suites
  // running in the same Jest worker environment.
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  function createService(): ChatService {
    return new ChatService(display, textService, maidr);
  }

  function mockJsonResponse(payload: unknown): void {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => payload,
    } as Response);
  }

  function lastRequest(): { url: string; headers: Record<string, string>; body: any } {
    const [url, options] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return {
      url,
      headers: options.headers as Record<string, string>,
      body: JSON.parse(options.body as string),
    };
  }

  test('Claude: sends a correct direct messages-API request', async () => {
    mockJsonResponse({
      content: [
        // Thinking-capable models emit thinking blocks before the text block.
        { type: 'thinking', thinking: '' },
        { type: 'text', text: 'The trend is upward.' },
      ],
    });

    const response = await createService().sendMessage('ANTHROPIC_CLAUDE', {
      message: 'What is the trend?',
      customInstruction: '',
      expertise: 'basic',
      apiKey: 'sk-ant-test',
      version: 'claude-sonnet-4-6',
    });

    expect(response).toEqual({ success: true, data: 'The trend is upward.' });

    const { url, headers, body } = lastRequest();
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(headers.Authorization).toBeUndefined();
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(typeof body.system).toBe('string');
    // Image data must be raw base64 without the data-URL prefix.
    expect(body.messages[0].content[0]).toEqual(
      expect.objectContaining({
        type: 'image',
        source: expect.objectContaining({ media_type: 'image/jpeg', data: 'QUJD' }),
      }),
    );
  });

  test('OpenAI: sends the selected model with bearer auth', async () => {
    mockJsonResponse({ choices: [{ message: { content: 'Answer.' } }] });

    const response = await createService().sendMessage('OPENAI', {
      message: 'Describe the chart.',
      customInstruction: '',
      expertise: 'basic',
      apiKey: 'sk-openai-test',
      version: 'gpt-5.4-mini',
    });

    expect(response).toEqual({ success: true, data: 'Answer.' });

    const { url, headers, body } = lastRequest();
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(headers.Authorization).toBe('Bearer sk-openai-test');
    expect(body.model).toBe('gpt-5.4-mini');

    // Chat requests must carry a timeout so a hung provider cannot stall
    // the chat indefinitely.
    const [, options] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  test('Gemini: encodes the selected model and key in the URL', async () => {
    mockJsonResponse({ candidates: [{ content: { parts: [{ text: 'Answer.' }] } }] });

    const response = await createService().sendMessage('GOOGLE_GEMINI', {
      message: 'Describe the chart.',
      customInstruction: '',
      expertise: 'basic',
      apiKey: 'g-key',
      version: 'gemini-2.5-pro',
    });

    expect(response).toEqual({ success: true, data: 'Answer.' });

    const { url, headers } = lastRequest();
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=g-key');
    expect(headers.Authorization).toBeUndefined();
  });

  test('Ollama: targets the configured server with no auth header', async () => {
    mockJsonResponse({ message: { content: 'Answer.' } });

    const response = await createService().sendMessage('OLLAMA', {
      message: 'Describe the chart.',
      customInstruction: '',
      expertise: 'basic',
      apiKey: 'http://localhost:11434/',
      version: 'mistral',
    });

    expect(response).toEqual({ success: true, data: 'Answer.' });

    const { url, headers, body } = lastRequest();
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(headers.Authorization).toBeUndefined();
    expect(body.model).toBe('mistral');
    expect(body.stream).toBe(false);
    // The user turn carries the raw base64 image for multimodal models.
    expect(body.messages[1].images).toEqual(['QUJD']);
  });

  test('Ollama: rejects MAIDR-proxy routing with a clear error', async () => {
    const response = await createService().sendMessage('OLLAMA', {
      message: 'Describe the chart.',
      customInstruction: '',
      expertise: 'basic',
      apiKey: 'http://localhost:11434',
      clientToken: 'proxy-token',
      email: 'user@example.com',
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('proxy');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('falls back to the provider default version when none is selected', async () => {
    mockJsonResponse({ choices: [{ message: { content: 'Answer.' } }] });

    await createService().sendMessage('OPENAI', {
      message: 'Describe the chart.',
      customInstruction: '',
      expertise: 'basic',
      apiKey: 'sk-openai-test',
    });

    const { body } = lastRequest();
    expect(typeof body.model).toBe('string');
    expect(body.model.length).toBeGreaterThan(0);
  });
});

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
 * Creates a ChatService with stubbed collaborators for serialization tests.
 * @param maidr - The initial chart data
 * @returns The service under test
 */
function createDataChatService(maidr: Maidr): ChatService {
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
    const service = createDataChatService(initial);

    expect(service.getDataJson()).toBe(JSON.stringify(initial));
  });

  test('updateData refreshes the chart data shared with LLM providers', () => {
    const service = createDataChatService(createMaidr(1));
    const updated = createMaidr(42);

    service.updateData(updated);

    expect(service.getDataJson()).toBe(JSON.stringify(updated));
  });

  test('serialization is lazy: streaming updates do not stringify', () => {
    const initial = createMaidr(1);
    const service = createDataChatService(initial);
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
    const service = createDataChatService(createMaidr(1));
    const spy = jest.spyOn(JSON, 'stringify');

    service.getDataJson();
    service.getDataJson();

    const chartCalls = spy.mock.calls.filter(
      call => (call[0] as Maidr | undefined)?.id === 'chat-chart',
    );
    expect(chartCalls).toHaveLength(1);
  });
});
