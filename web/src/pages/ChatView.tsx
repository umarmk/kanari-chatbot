import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useChats } from '../store/chats';
import { useAuth } from '../store/auth';
import { API_BASE } from '../lib/api';
import { log } from '../lib/logger';

export default function ChatView() {
  const { chatId } = useParams();
  const { messagesByChat, loadMessages, upsertAssistantStreaming, addMessage } = useChats();
  const msgs = messagesByChat[chatId || ''] || [];
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [hasTokens, setHasTokens] = useState(false);
  const lastPromptRef = useRef<string>('');
  const { accessToken } = useAuth();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (chatId) loadMessages(chatId);
  }, [chatId, loadMessages]);

  const canSend = useMemo(() => !!input.trim() && !!chatId && !streaming, [input, chatId, streaming]);

  async function startStream(content: string) {
    if (!chatId) return;
    setLastError(null);
    setHasTokens(false);
    lastPromptRef.current = content;
    setStreaming(true);
    log.info('ui.chat.send', { chatId });

    // Show the user message immediately and an assistant placeholder
    addMessage(chatId, { id: 'tmp-user', role: 'user', content, createdAt: new Date().toISOString() } as any);
    upsertAssistantStreaming(chatId, '');

    const url = `${API_BASE}/chats/${chatId}/stream?content=${encodeURIComponent(content)}`;
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'text/event-stream' }, signal: ctrl.signal });
      if (!resp.ok || !resp.body) throw new Error('stream_failed');
      const reader = (resp.body as any).getReader?.();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let acc = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line || !line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') break;
          try {
            const json = JSON.parse(data);
            const delta = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || '';
            if (delta) {
              acc += delta;
              setHasTokens(true);
              upsertAssistantStreaming(chatId, acc);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setLastError(e?.message || 'Stream failed');
      log.error('ui.chat.stream_error', e?.message);
    } finally {
      setStreaming(false);
      abortRef.current = null;
      // refresh persisted messages
      if (chatId) loadMessages(chatId);
      log.info('ui.chat.stream_end', { chatId });
    }
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || !chatId) return;
    const content = input.trim();
    setInput('');
    await startStream(content);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto p-6 space-y-3">
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] rounded px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-yellow-200 text-black' : 'bg-gray-100 text-black'}`}>
              {m.id === 'streaming' && m.role === 'assistant' && !m.content && (
                <span className="inline-flex items-center gap-2 text-gray-500"><span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></span> Assistant is typing...</span>
              )}
              {m.content}
            </div>
          </div>
        ))}
        {!msgs.length && <div className="text-center text-gray-500">No messages yet. Say hello!</div>}
      </div>
      <form onSubmit={onSend} className="p-4 border-t bg-white">
        {lastError && (
          <div className="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 flex items-center justify-between">
            <span>Error: {lastError}</span>
            <button type="button" className="text-red-800 underline" onClick={() => startStream(lastPromptRef.current)}>Retry</button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            className="flex-1 border rounded px-3 py-2 text-sm h-24"
            placeholder="Message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as any)?.requestSubmit(); } }}
            disabled={streaming}
          />
          {streaming ? (
            <div className="flex items-center gap-2 self-end">
              <span className={`text-xs text-gray-600 ${hasTokens ? '' : 'animate-pulse'}`}>{hasTokens ? 'Streaming…' : 'Waiting for response…'}</span>
              <button
                type="button"
                className="bg-gray-300 hover:bg-gray-400 text-black rounded px-4 py-2 text-sm"
                onClick={() => { abortRef.current?.abort(); }}
              >Stop</button>
            </div>
          ) : (
            <button className="bg-yellow-400 hover:bg-yellow-500 text-black rounded px-4 py-2 text-sm" disabled={!canSend} type="submit">
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

