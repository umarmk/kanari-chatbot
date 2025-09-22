import { create } from 'zustand';
import { api } from '../lib/api';
import { log } from '../lib/logger';

export type Chat = { id: string; projectId: string; title?: string; createdAt: string };
export type Message = { id: string; role: 'user' | 'assistant' | 'system'; content: string; createdAt: string };

type State = {
  chatsByProject: Record<string, Chat[]>;
  messagesByChat: Record<string, Message[]>;
  loading: boolean;
  error?: string;
  loadChats: (projectId: string) => Promise<void>;
  createChat: (projectId: string, title?: string) => Promise<Chat>;
  deleteChat: (chatId: string, projectId: string) => Promise<void>;
  updateChat: (projectId: string, chatId: string, title: string) => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  addMessage: (chatId: string, msg: Message) => void;
  upsertAssistantStreaming: (chatId: string, content: string) => void;
};

export const useChats = create<State>((set) => ({
  chatsByProject: {},
  messagesByChat: {},
  loading: false,
  error: undefined,

  async loadChats(projectId) {
    set({ loading: true, error: undefined });
    try {
      const res = await api.get(`/projects/${projectId}/chats`);
      set((s) => ({ chatsByProject: { ...s.chatsByProject, [projectId]: res.data }, loading: false }));
    } catch (e: any) {
      log.error('chats.load_failed', e?.message);
      set({ loading: false, error: e?.response?.data?.message || 'Failed to load chats' });
    }
  },

  async createChat(projectId, title) {
    const res = await api.post(`/projects/${projectId}/chats`, { title });
    set((s) => ({ chatsByProject: { ...s.chatsByProject, [projectId]: [res.data, ...(s.chatsByProject[projectId]||[])] } }));
    log.info('chats.created', { id: res.data?.id });
    return res.data as Chat;
  },

  async deleteChat(chatId, projectId) {
    await api.delete(`/chats/${chatId}`);
    set((s) => {
      const { [chatId]: _, ...restMsgs } = s.messagesByChat;
      return { chatsByProject: { ...s.chatsByProject, [projectId]: (s.chatsByProject[projectId]||[]).filter(c=>c.id!==chatId) }, messagesByChat: restMsgs };
    });
  },

  async loadMessages(chatId) {
    const res = await api.get(`/chats/${chatId}/messages`);
    set((s) => ({ messagesByChat: { ...s.messagesByChat, [chatId]: res.data } }));
  },

  addMessage(chatId, msg) {
    set((s) => ({ messagesByChat: { ...s.messagesByChat, [chatId]: [ ...(s.messagesByChat[chatId]||[]), msg ] } }));
  },

  async updateChat(projectId, chatId, title) {
    await api.patch(`/chats/${chatId}`, { title });
    set((s) => ({ chatsByProject: { ...s.chatsByProject, [projectId]: (s.chatsByProject[projectId]||[]).map(c=>c.id===chatId?{...c,title}:c) } }));
  },

  // For live token appending in UI before persisted assistant message arrives
  upsertAssistantStreaming(chatId, content) {
    set((s) => {
      const arr = [...(s.messagesByChat[chatId]||[])];
      const last = arr[arr.length-1];
      if (last && last.role === 'assistant' && last.id === 'streaming') {
        last.content = content;
      } else {
        arr.push({ id: 'streaming', role: 'assistant', content, createdAt: new Date().toISOString() } as any);
      }
      return { messagesByChat: { ...s.messagesByChat, [chatId]: arr } };
    });
  },
}));

