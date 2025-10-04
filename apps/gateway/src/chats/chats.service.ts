import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Observable } from 'rxjs';
import { ContextService } from './context.service';

const FREE_MODELS = new Set<string>([
  'deepseek/deepseek-chat-v3.1:free',
  'google/gemini-2.0-flash-exp:free',
]);
const PAID_MODELS = new Set<string>([
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.0-flash-lite-001',
  'openai/gpt-5-nano',
]);

@Injectable()
export class ChatsService {
  private readonly logger = new Logger('ChatsService');
  constructor(private prisma: PrismaService, private readonly context: ContextService) {}

  async ensureProjectOwnership(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, userId } });
    if (!project) throw new HttpException('project_not_found', HttpStatus.NOT_FOUND);
    return project;
  }

  async ensureChatOwnership(userId: string, chatId: string) {
    const chat = await this.prisma.chat.findFirst({ where: { id: chatId, userId } });
    if (!chat) throw new HttpException('chat_not_found', HttpStatus.NOT_FOUND);
    return chat;
  }

  // Chats
  createChat(userId: string, projectId: string, title?: string) {
    return this.prisma.chat.create({ data: { userId, projectId, title } });
  }
  listChats(userId: string, projectId: string) {
    return this.prisma.chat.findMany({ where: { userId, projectId }, orderBy: { createdAt: 'desc' } });
  }
  getChat(userId: string, id: string) {
    return this.prisma.chat.findFirst({ where: { id, userId } });
  }
  async deleteChat(userId: string, id: string) {
    await this.ensureChatOwnership(userId, id);
    await this.prisma.message.deleteMany({ where: { chatId: id } });
    return this.prisma.chat.delete({ where: { id } });
  }
  async updateChat(userId: string, id: string, dto: { title?: string }) {
    await this.ensureChatOwnership(userId, id);
    return this.prisma.chat.update({ where: { id }, data: { title: dto?.title } });
  }

  // Messages
  listMessages(userId: string, chatId: string) {
    return this.prisma.message.findMany({ where: { chatId, userId }, orderBy: { createdAt: 'asc' } });
  }
  async createUserMessage(userId: string, chatId: string, content: string) {
    await this.ensureChatOwnership(userId, chatId);
    return this.prisma.message.create({ data: { chatId, userId, role: 'user', content } });
  }

  // SSE streaming via OpenRouter (falls back to stub if no key)
  streamAssistantReply(userId: string, chatId: string, content: string, openrouterKey?: string): Observable<MessageEvent> {
    const self = this;
    return new Observable<MessageEvent>((subscriber) => {
      (async () => {
        try {
          // Save user message first
          await self.createUserMessage(userId, chatId, content);

          // Gather context
          const chat = await self.ensureChatOwnership(userId, chatId);
          const project = await self.prisma.project.findFirst({ where: { id: chat.projectId, userId } });
          const history = await self.prisma.message.findMany({ where: { chatId }, orderBy: { createdAt: 'asc' } });
          const messages: Array<{ role: string; content: string }> = [];
          if (project?.systemPrompt) messages.push({ role: 'system', content: project.systemPrompt });

          // Build file context block (if any)
          const contextBlock = await self.context.buildContextForChat(project!.id, chatId, content);
          if (contextBlock) messages.push({ role: 'system', content: contextBlock });

          for (const m of history) messages.push({ role: m.role, content: m.content });

          const defaultModel = 'deepseek/deepseek-chat-v3.1:free';
          const model = project?.model || defaultModel;

          // Determine which key to use and enforce allowlist
          const envKey = process.env.OPENROUTER_API_KEY;
          const usingUserKey = !!openrouterKey && PAID_MODELS.has(model);

          if (PAID_MODELS.has(model) && !usingUserKey) {
            throw new HttpException('paid_model_requires_user_key', HttpStatus.FORBIDDEN);
          }

          const key = usingUserKey ? openrouterKey! : envKey;

          // If no key, emit a short stub stream and persist assistant message
          if (!key) {
            const tokens = ['Thinking', '…', ' ', 'Thanks', ' ', 'for', ' ', 'your', ' ', 'message', '.'];
            for (const t of tokens) { subscriber.next({ data: t } as any); await new Promise((r) => setTimeout(r, 60)); }
            await self.prisma.message.create({ data: { chatId, userId, role: 'assistant', content: tokens.join('') } });
            subscriber.next({ data: '[DONE]' } as any);
            subscriber.complete();
            return;
          }

          // Call OpenRouter with streaming
          const ctrl = new AbortController();
          const timeoutMs = Number(process.env.OPENROUTER_STREAM_TIMEOUT_MS || 60000);
          const timeout = setTimeout(() => ctrl.abort(), timeoutMs);

          const body: any = { model, messages, stream: true };
          if (PAID_MODELS.has(model)) {
            body.plugins = [{ id: 'file-parser', pdf: { engine: 'native' } }]; // harmless hint for future PDF support
          }

          const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${key}`,
              'HTTP-Referer': process.env.GATEWAY_PUBLIC_URL || 'http://localhost:3000',
              'X-Title': 'Kanari',
            },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });
          clearTimeout(timeout);

          if (!resp.ok || !resp.body) {
            const text = await resp.text().catch(() => '');
            throw new HttpException(`openrouter_error: ${resp.status} ${text}`, HttpStatus.BAD_GATEWAY);
          }

          const reader: ReadableStreamDefaultReader<Uint8Array> = (resp.body as any).getReader?.();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';
          let full = '';

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, idx).trim();
              buffer = buffer.slice(idx + 1);
              if (!line) continue;
              if (!line.startsWith('data:')) continue;
              const data = line.slice(5).trim();
              if (data === '[DONE]') {
                // End of stream
                buffer = '';
                break;
              }
              try {
                const json = JSON.parse(data);
                const choice = json?.choices?.[0] || {};
                let delta = '';
                if (typeof choice?.delta === 'string') delta = choice.delta;
                else if (choice?.delta?.content) delta = choice.delta.content;
                else if (typeof choice?.message === 'string') delta = choice.message;
                else if (choice?.message?.content) delta = choice.message.content;
                else if (choice?.content) delta = choice.content;

                if (typeof delta !== 'string') delta = String(delta || '');

                if (delta) {
                  full += delta;
                  // Send string fragments; FE will handle both string and JSON formats
                  subscriber.next({ data: delta } as any);
                }
              } catch {
                // ignore parse errors (keep-alive)
              }
            }
          }

          if (full) {
            await self.prisma.message.create({ data: { chatId, userId, role: 'assistant', content: full } });
          }
          // Signal end-of-stream explicitly for FE
          subscriber.next({ data: '[DONE]' } as any);
          subscriber.complete();
        } catch (e: any) {
          self.logger.error('stream_error', e);
          subscriber.error(e);
        }
      })();
    });
  }
}
