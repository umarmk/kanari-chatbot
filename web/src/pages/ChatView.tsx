import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Paperclip, Send, X, Square, Pencil, Trash2 } from 'lucide-react';
import { useChats } from '../store/chats';
import { useAuth } from '../store/auth';
import { API_BASE, api } from '../lib/api';
import { log } from '../lib/logger';
import Markdown from '../components/Markdown';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Banner } from '../components/Banner';
import { getModelLabel, isPaidModel } from '../lib/models';



interface Chat { id: string; projectId: string; }

export default function ChatView() {

  const nav = useNavigate();
  const { chatId } = useParams();
  const { messagesByChat, loadMessages, upsertAssistantStreaming, addMessage, updateChat, deleteChat } = useChats();
  const msgs = messagesByChat[chatId || ''] || [];
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [hasTokens, setHasTokens] = useState(false);
  const lastPromptRef = useRef<string>('');
  const { accessToken } = useAuth();
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [noOutput, setNoOutput] = useState(false);
  const gotTokensRef = useRef(false);

  // For chat-level file upload
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [chatTitle, setChatTitle] = useState<string>('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState('');
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const blocks = useMemo(() => {
    const out: Array<{ role: string; items: any[] }> = [];
    let cur: { role: string; items: any[] } | null = null;
    for (const m of msgs) {
      if (!cur || cur.role !== m.role) {
        const group = { role: m.role as string, items: [m] as any[] };
        out.push(group);
        cur = group;
      } else {
        cur.items.push(m);
      }
    }
    return out;
  }, [msgs]);

  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [projectModel, setProjectModel] = useState<string | null>(null);
  const [openrouterKey, setOpenrouterKey] = useState<string | null>(null);

  useEffect(() => { if (textareaRef.current) textareaRef.current.focus(); }, [chatId]);
  useEffect(() => { setTempTitle(chatTitle || ''); }, [chatTitle]);
  useEffect(() => { if (editingTitle) setTimeout(()=>titleInputRef.current?.focus(), 0); }, [editingTitle]);

  useEffect(() => {
    if (!chatId) return;
    loadMessages(chatId);
    api.get(`/chats/${chatId}`).then((res)=> { const data = res.data as Chat & { title?: string }; setProjectId(data.projectId); setChatTitle(data.title || 'Untitled'); }).catch(()=>{});
  }, [chatId, loadMessages]);

  useEffect(() => {
    if (!projectId) return;
    api.get(`/projects/${projectId}`).then((res) => {
      setProjectModel(res.data?.model || null);
      setProjectName(res.data?.name || '');
      try { setOpenrouterKey(localStorage.getItem(`openrouterKey:${projectId}`)); } catch {}
    }).catch(()=>{});
  }, [projectId]);

  const isPaid = useMemo(() => isPaidModel(projectModel), [projectModel]);
  const modelLabel = useMemo(() => getModelLabel(projectModel), [projectModel]);
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
      // SSE stream: parse `data:` lines and accumulate fragments into a single assistant message.
      const headers: any = { Authorization: `Bearer ${accessToken}`, Accept: 'text/event-stream' };
      if (openrouterKey) headers['x-openrouter-key'] = openrouterKey;
      const resp = await fetch(url, { headers, signal: ctrl.signal });
      if (!resp.ok) {
        // Prefer backend error message to a generic stream_failed.
        const text = await resp.text().catch(() => '');
        let msg = text || `stream_failed (${resp.status})`;
        try {
          const parsed = JSON.parse(text);
          msg = parsed?.message || msg;
        } catch {}
        throw new Error(msg);
      }
      if (!resp.body) throw new Error('stream_failed');
      const reader = (resp.body as any).getReader?.();
      if (!reader) throw new Error('stream_unsupported');
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
      <div className="px-4 py-3 bg-[var(--surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface)]/85 sticky top-0 z-10 shadow-[0_1px_0_0_var(--border)] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-[var(--muted)] truncate">
            {projectId ? (<Link to={`/projects/${projectId}`} className="underline hover:opacity-90">{projectName || 'Project'}</Link>) : 'Project'}
          </div>
          <div className="min-w-0">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="w-full text-sm font-semibold bg-[var(--surface-2)] text-[var(--fg)] border border-[var(--border)] rounded px-2 py-1"
                value={tempTitle}
                onChange={(e)=>setTempTitle(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (projectId && chatId) { try { const next = (tempTitle || 'Untitled').trim(); await updateChat(projectId, chatId, next); setChatTitle(next); } catch {} }
                    setEditingTitle(false);
                  }
                  if (e.key === 'Escape') { setEditingTitle(false); setTempTitle(chatTitle || ''); }
                }}
                onBlur={async () => { if (projectId && chatId) { try { const next = (tempTitle || 'Untitled').trim(); if (next !== (chatTitle || 'Untitled')) { await updateChat(projectId, chatId, next); setChatTitle(next); } } catch {} } setEditingTitle(false); }}
              />
            ) : (
              <button className="text-sm font-semibold truncate text-left hover:opacity-90" onClick={()=>{ setEditingTitle(true); setTempTitle(chatTitle || 'Untitled'); }}>
                {chatTitle || 'Untitled'}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                className="p-2 rounded-md bg-[var(--chip)] border border-[var(--border)] hover:opacity-95"
                onClick={() => { setEditingTitle(true); setTempTitle(chatTitle || 'Untitled'); }}
                aria-label="Rename chat"
              ><Pencil size={14} /></button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content side="left" align="center" sideOffset={6} className="rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg)] text-xs px-2 py-1 shadow-sm">Rename</Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                className="p-2 rounded-md bg-[var(--chip)] border border-[var(--border)] text-red-600 hover:opacity-95"
                onClick={async () => {
                  if (!projectId || !chatId) return;
                  if (!confirm('Delete this chat?')) return;
                  try { await deleteChat(chatId, projectId); nav(`/projects/${projectId}`); } catch {}
                }}
                aria-label="Delete chat"
              ><Trash2 size={14} /></button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content side="left" align="center" sideOffset={6} className="rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg)] text-xs px-2 py-1 shadow-sm">Delete</Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 scroll-area">
        {blocks.map((b, bi) => (
          <div key={bi} className="mb-3">
            {b.items.map((m, mi) => (
              <div key={m.id || mi} className={`flex ${b.role === 'user' ? 'justify-end' : 'justify-start'} ${mi > 0 ? 'mt-1' : ''}`}>
                <div className={`max-w-[70%] rounded-2xl shadow-sm px-3 py-2 text-sm md:text-[0.95rem] ${b.role === 'user' ? 'bg-[var(--bubble-user)] text-[var(--fg)] whitespace-pre-wrap' : 'bg-[var(--bubble-assistant)] text-[var(--fg)]'}`}>
                  {m.id === 'streaming' && b.role === 'assistant' && !m.content && (
                    <span className="inline-flex items-center gap-2 text-[var(--muted)]"><span className="w-2 h-2 bg-[var(--chip)] rounded-full animate-pulse"></span> Assistant is typing...</span>
                  )}
                  {b.role === 'assistant' ? (
                    <Markdown content={m.content || ''} />
                  ) : (
                    <>{m.content}</>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
        {!msgs.length && <div className="text-center text-[var(--muted)]">No messages yet. Say hello!</div>}
      </div>
      {(pendingFileName || pendingPreviewUrl) && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-3 border border-[var(--border)] rounded p-2 bg-[var(--surface-2)]">
            {pendingPreviewUrl && (
              <img src={pendingPreviewUrl} alt="preview" className="w-12 h-12 object-cover rounded border" />
            )}

            <div className="flex-1 text-sm text-[var(--fg)] truncate">{pendingFileName}</div>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button type="button" className="p-1 rounded text-red-600 hover:bg-[var(--row-hover)]"
                  onClick={() => { setPendingFileName(null); if (pendingPreviewUrl) { URL.revokeObjectURL(pendingPreviewUrl); setPendingPreviewUrl(null); } }}
                  aria-label="Remove attachment">
                  <X size={14} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content side="left" align="center" sideOffset={6} className="rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg)] text-xs px-2 py-1 shadow-sm">Remove</Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
        </div>
      )}

      <form onSubmit={onSend} className="p-4 border-t border-[var(--border)] bg-[var(--surface)] shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
        {lastError && (
          <div className="mb-2">
            <Banner type="error">
              <span className="mr-2">{lastError}</span>
              <button type="button" className="underline" onClick={() => startStream(lastPromptRef.current)}>Retry</button>
            </Banner>
          </div>
        )}
        {noOutput && !lastError && (
          <div className="mb-2">
            <Banner type="info" onClose={() => setNoOutput(false)}>
              No response received. Try again or rephrase.
            </Banner>
          </div>
        )}

        {/* Composer header: model label and key status */}
        <div className="mb-2 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[var(--muted)]">Model:</span>
            <span className="px-2 py-[2px] rounded bg-[var(--chip)] text-[var(--fg)]">{modelLabel}</span>
            <span className="px-2 py-[2px] rounded bg-[var(--chip)] text-[var(--fg)] inline-flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${isPaid ? 'bg-purple-500' : 'bg-emerald-500'}`} />
              {isPaid ? 'Paid' : 'Free'}
            </span>
          </div>
          {isPaid && (
            <div className="flex items-center gap-2">
              {openrouterKey ? (
                <span className="px-2 py-[2px] rounded bg-[var(--chip)] text-[var(--fg)] inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Key saved
                </span>
              ) : (
                <span className="px-2 py-[2px] rounded bg-[var(--chip)] text-[var(--fg)] inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Key required {projectId && (<Link to={`/projects/${projectId}`} className="underline ml-1">Add key</Link>)}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 items-end">
          <label className="self-end">
            <span className="inline-flex items-center gap-2 bg-[var(--chip)] hover:opacity-95 text-[var(--fg)] rounded-md px-3 py-2 text-sm cursor-pointer border border-[var(--border)] shadow-sm">
              {uploading ? 'Uploading…' : (<span className="inline-flex items-center gap-2"><Paperclip size={14} /> Attach</span>)}
            </span>
            <input type="file" onChange={onPickFile} disabled={!projectId || uploading || streaming} className="hidden" />
          </label>

          <textarea
            ref={textareaRef}
            className="flex-1 border border-[var(--border)] bg-[var(--surface)] rounded-md px-3 py-2 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-[rgba(234,179,8,0.35)]"
            placeholder="Message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as any)?.requestSubmit(); } }}
            disabled={streaming}
          />

          {!streaming && (
            <button type="button" className="bg-[var(--chip)] hover:opacity-95 text-[var(--fg)] rounded px-3 py-2 text-sm" onClick={() => { setInput(''); setPendingFileName(null); if (pendingPreviewUrl) { URL.revokeObjectURL(pendingPreviewUrl); setPendingPreviewUrl(null); } }}>
              <span className="inline-flex items-center gap-2"><X size={14} /> Clear</span>
            </button>
          )}

          {streaming ? (
            <div className="flex items-center gap-2 self-end">
              <span className={`text-xs text-[var(--muted)] ${hasTokens ? '' : 'animate-pulse'}`}>{hasTokens ? 'Streaming…' : 'Waiting for response…'}</span>
              <button
                type="button"
                className="bg-[var(--chip)] hover:opacity-95 text-[var(--fg)] rounded px-3 py-2 text-sm inline-flex items-center gap-2"
                onClick={() => { abortRef.current?.abort(); }}
              ><Square size={14} /> Stop</button>
            </div>
          ) : (
            <button className="bg-yellow-400 hover:bg-yellow-500 text-black rounded px-4 py-2 text-sm inline-flex items-center gap-2" disabled={!canSend} type="submit">
              <Send size={14} /> Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
