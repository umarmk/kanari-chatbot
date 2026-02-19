import { ChatsService } from './chats.service';

describe('ChatsService (unit)', () => {
  const originalFetch = (global as any).fetch;

  afterEach(() => {
    (global as any).fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('sends the current user prompt upstream exactly once', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-test';
    process.env.OPENROUTER_STREAM_TIMEOUT_MS = '5000';

    const prisma: any = {
      chat: { findFirst: jest.fn() },
      project: { findFirst: jest.fn() },
      message: { create: jest.fn(), findMany: jest.fn() },
    };
    const context: any = { buildContextForChat: jest.fn() };

    const userId = 'u1';
    const chatId = 'c1';

    prisma.chat.findFirst.mockResolvedValue({ id: chatId, userId, projectId: 'p1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'p1',
      userId,
      model: 'deepseek/deepseek-chat-v3.1:free',
      systemPrompt: 'You are a helpful assistant.',
    });
    context.buildContextForChat.mockResolvedValue('[CTX]');

    prisma.message.create.mockImplementation(async ({ data }: any) => {
      if (data.role === 'user') return { id: 'm_new', ...data };
      return { id: 'm_assistant', ...data };
    });
    prisma.message.findMany.mockResolvedValue([
      { id: 'm_prev', role: 'assistant', content: 'previous answer' },
      { id: 'm_new', role: 'user', content: 'hello' },
    ]);

    let capturedBody: any = null;
    (global as any).fetch = jest.fn(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      const encoder = new TextEncoder();
      const payload = encoder.encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n');
      let sent = false;
      return {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () => {
              if (sent) return { value: undefined, done: true };
              sent = true;
              return { value: payload, done: false };
            },
          }),
        },
        text: async () => '',
      } as any;
    });

    const svc = new ChatsService(prisma, context);
    await new Promise<void>((resolve, reject) => {
      svc.streamAssistantReply(userId, chatId, 'hello').subscribe({
        error: reject,
        complete: resolve,
      });
    });

    expect(capturedBody).toBeTruthy();
    const upstreamMessages = capturedBody.messages as Array<{ role: string; content: string }>;
    expect(upstreamMessages.filter((m) => m.role === 'user' && m.content === 'hello')).toHaveLength(0);
    expect(
      upstreamMessages.filter((m) => m.role === 'user' && m.content.includes("User's question: hello")),
    ).toHaveLength(1);
  });
});

