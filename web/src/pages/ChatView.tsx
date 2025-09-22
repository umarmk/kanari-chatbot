import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useChats } from '../store/chats';
import { useAuth } from '../store/auth';
import { API_BASE, api } from '../lib/api';
import { log } from '../lib/logger';


interface Chat { id: string; projectId: string; }

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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [noOutput, setNoOutput] = useState(false);
  const gotTokensRef = useRef(false);

  // For chat-level file upload
  const [projectId, setProjectId] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [projectModel, setProjectModel] = useState<string | null>(null);
  const [openrouterKey, setOpenrouterKey] = useState<string | null>(null);

  useEffect(() => { if (textareaRef.current) textareaRef.current.focus(); }, [chatId]);

  useEffect(() => {
    if (!chatId) return;
    loadMessages(chatId);
    api.get(`/chats/${chatId}`).then((res)=> setProjectId((res.data as Chat).projectId)).catch(()=>{});
  }, [chatId, loadMessages]);

  useEffect(() => {
    if (!projectId) return;
    api.get(`/projects/${projectId}`).then((res) => {
      setProjectModel(res.data?.model || null);
      try { setOpenrouterKey(localStorage.getItem(`openrouterKey:${projectId}`)); } catch {}
    }).catch(()=>{});
  }, [projectId]);

  const isPaid = useMemo(() => !!projectModel && !projectModel.endsWith(':free'), [projectModel]);
  const canSend = useMemo(() => !!input.trim() && !!chatId && !streaming && (!isPaid || !!openrouterKey), [input, chatId, streaming, isPaid, openrouterKey]);



  async function startStream(content: string) {
    if (!chatId) return;
    setLastError(null);
    setNoOutput(false);
    gotTokensRef.current = false;
    setHasTokens(false);
    lastPromptRef.current = content;
    setStreaming(true);
    log.info('ui.chat.send', { chatId });

    // Show the user message immediately and an assistant placeholder
    const userContent = pendingFileName ? `${content}\n\n(Attached: ${pendingFileName})` : content;
    addMessage(chatId, { id: 'tmp-user', role: 'user', content: userContent, createdAt: new Date().toISOString() } as any);
    upsertAssistantStreaming(chatId, '');

    const url = `${API_BASE}/chats/${chatId}/stream?content=${encodeURIComponent(content)}`;
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const headers: any = { Authorization: `Bearer ${accessToken}`, Accept: 'text/event-stream' };
      if (openrouterKey) headers['x-openrouter-key'] = openrouterKey;
      const resp = await fetch(url, { headers, signal: ctrl.signal });
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
            const parsed = JSON.parse(data);
            let frag = '' as any;
            if (typeof parsed === 'string') {
              frag = parsed;
            } else {
              const choice = parsed?.choices?.[0] || {};
              frag = choice?.delta?.content || choice?.message?.content || choice?.content || '';
            }
            if (frag) {
              acc += String(frag);
              gotTokensRef.current = true;
              setHasTokens(true);
              upsertAssistantStreaming(chatId, acc);
            }
          } catch {
            // Fallback: treat as raw string (may be already JSON-stringified by SSE)
            let frag = data;
            try { if (data.startsWith('"')) frag = JSON.parse(data); } catch {}
            if (frag) {
              acc += String(frag);
              gotTokensRef.current = true;
              setHasTokens(true);
              upsertAssistantStreaming(chatId, acc);
            }
          }
        }
      }
    } catch (e: any) {
      setLastError(e?.message || 'Stream failed');
      log.error('ui.chat.stream_error', e?.message);
    } finally {
      setStreaming(false);
      abortRef.current = null;
      if (!gotTokensRef.current) setNoOutput(true); else setNoOutput(false);
      // refresh persisted messages
      if (chatId) loadMessages(chatId);
      log.info('ui.chat.stream_end', { chatId });
      // clear pending file after send
      setPendingFileName(null);
      if (pendingPreviewUrl) { URL.revokeObjectURL(pendingPreviewUrl); setPendingPreviewUrl(null); }

    }

  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || !chatId) return;
    const content = input.trim();
    setInput('');
    await startStream(content);
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !projectId) return;
    setUploading(true); setLastError(null);
    try {
      if (f.type.startsWith('image/')) setPendingPreviewUrl(URL.createObjectURL(f));
      setPendingFileName(f.name);
      const form = new FormData();
      form.append('file', f);
      await api.post('/files', form, { params: { project_id: projectId }, headers: { 'Content-Type': 'multipart/form-data' } });
      log.info('ui.chat.file_uploaded', { name: f.name, size: f.size });
    } catch (err: any) {
      setPendingFileName(null);
      if (pendingPreviewUrl) { URL.revokeObjectURL(pendingPreviewUrl); setPendingPreviewUrl(null); }

      const raw = err?.response?.data?.message || err?.message || '';
      let msg = 'File upload failed';
      const lower = String(raw).toLowerCase();
      if (raw === 'unsupported_file_type') msg = 'Unsupported file type. Allowed: text, JSON, XML, JS/TS, PDF, images (images not used in context).';
      else if (lower.includes('file too large') || err?.response?.status === 413) msg = 'File too large (limit 20 MB).';
      else if (raw) msg = raw;
      setLastError(msg);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
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
      {(pendingFileName || pendingPreviewUrl) && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-3 border rounded p-2 bg-gray-50">
            {pendingPreviewUrl && (
              <img src={pendingPreviewUrl} alt="preview" className="w-12 h-12 object-cover rounded border" />
            )}

            <div className="flex-1 text-sm text-gray-700 truncate">{pendingFileName}</div>
            <button type="button" className="text-xs text-gray-700 underline"
              onClick={() => { setPendingFileName(null); if (pendingPreviewUrl) { URL.revokeObjectURL(pendingPreviewUrl); setPendingPreviewUrl(null); } }}>
              Remove
            </button>
          </div>
        </div>
      )}

      <form onSubmit={onSend} className="p-4 border-t bg-white">
        {lastError && (
          <div className="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 flex items-center justify-between">
            <span>Error: {lastError}</span>
            <button type="button" className="text-red-800 underline" onClick={() => startStream(lastPromptRef.current)}>Retry</button>
          </div>
        )}
        {noOutput && !lastError && (
          <div className="mb-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1 flex items-center justify-between">
            <span>No response received. Try again or rephrase.</span>
            <button type="button" className="text-gray-800 underline" onClick={() => setNoOutput(false)}>Dismiss</button>
          </div>
        )}
        {isPaid && !openrouterKey && (
          <div className="mb-2 text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
            Paid model selected. Add your OpenRouter API key in project settings to enable sending. {projectId && (<Link to={`/projects/${projectId}`} className="underline">Open settings</Link>)}.
          </div>
        )}
        <div className="flex gap-2 items-end">
          <label className="self-end">
            <span className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded px-3 py-2 text-sm cursor-pointer">
              {uploading ? 'Uploading…' : 'Attach'}
            </span>
            <input type="file" onChange={onPickFile} disabled={!projectId || uploading || streaming} className="hidden" />
          </label>

          <textarea
            ref={textareaRef}
            className="flex-1 border rounded px-3 py-2 text-sm h-24"
            placeholder="Message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as any)?.requestSubmit(); } }}
            disabled={streaming}
          />

          {!streaming && (
            <button type="button" className="bg-gray-100 hover:bg-gray-200 text-black rounded px-3 py-2 text-sm" onClick={() => { setInput(''); setPendingFileName(null); if (pendingPreviewUrl) { URL.revokeObjectURL(pendingPreviewUrl); setPendingPreviewUrl(null); } }}>
              Clear
            </button>
          )}

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

