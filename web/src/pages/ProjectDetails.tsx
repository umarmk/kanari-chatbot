import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { log } from '../lib/logger';
import { useProjects } from '../store/projects';
import { useChats } from '../store/chats';
import { FREE_MODELS, PAID_MODELS } from '../lib/models';
import { Banner } from '../components/Banner';
import { useToast } from '../components/ToastProvider';

interface Project { id: string; name: string; model?: string|null; systemPrompt?: string|null; createdAt: string; }
interface FileRec { id: string; name: string; size: number; mime: string; createdAt: string; }
type ModelInfo = { id: string; label: string; access: 'free' | 'paid' };

export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [err, setErr] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  const [files, setFiles] = useState<FileRec[]>([]);
  const [uploading, setUploading] = useState(false);

  const [openrouterKey, setOpenrouterKey] = useState('');

  const projectId = useMemo(() => id as string, [id]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  // Fallback list for offline/dev scenarios; backend remains the source of truth via `GET /models`.
  const fallbackModels = useMemo<ModelInfo[]>(
    () => [
      ...FREE_MODELS.map((m) => ({ ...m, access: 'free' as const })),
      ...PAID_MODELS.map((m) => ({ ...m, access: 'paid' as const })),
    ],
    [],
  );
  const allModels = useMemo(() => (models.length ? models : fallbackModels), [models, fallbackModels]);
  const freeModels = useMemo(() => allModels.filter((m) => m.access === 'free'), [allModels]);
  const paidModels = useMemo(() => allModels.filter((m) => m.access === 'paid'), [allModels]);
  const isPaidSelected = useMemo(() => allModels.some((m) => m.id === model && m.access === 'paid'), [allModels, model]);

  async function load() {
    if (!projectId) return;
    setLoading(true); setErr(null);
    try {
      const [p, f, m] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/files`, { params: { project_id: projectId } }),
        // Fetch backend allowlist to keep FE in sync with BE model validation.
        api.get(`/models`).catch(() => null),
      ]);
      const backendModels = (m as any)?.data?.models as ModelInfo[] | undefined;
      const defaultModel = (m as any)?.data?.default_model as string | undefined;
      if (Array.isArray(backendModels) && backendModels.length) setModels(backendModels);
      setProject(p.data);
      setName(p.data.name || '');
      setModel(p.data.model || defaultModel || '');
      setSystemPrompt(p.data.systemPrompt || '');
      setFiles(f.data);
      try { setOpenrouterKey(localStorage.getItem(`openrouterKey:${projectId}`) || ''); } catch {}
      log.info('ui.project.loaded', { id: projectId, files: f.data?.length });
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load project');
      log.error('ui.project.load_failed', { id: projectId });
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);



  async function onDelete() {
    if (!confirm('Delete this project?')) return;
    try {
      await api.delete(`/projects/${projectId}`);
      // remove from sidebar immediately
      useProjects.getState().remove(projectId);
      log.info('ui.project.deleted', { id: projectId });
      nav('/');
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to delete');
      log.error('ui.project.delete_failed', { id: projectId });
    }
  }

  const toast = useToast();
  function onSaveKey(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (openrouterKey) {
        localStorage.setItem(`openrouterKey:${projectId}`, openrouterKey);
        toast.success('OpenRouter key saved');
      } else {
        localStorage.removeItem(`openrouterKey:${projectId}`);
        toast.info('OpenRouter key removed');
      }
      log.info('ui.project.key_saved', { id: projectId, hasKey: !!openrouterKey });
    } catch {}
  }

  async function onNewChat() {
    try {
      const chat = await useChats.getState().createChat(projectId);
      nav(`/projects/${projectId}/chats/${chat.id}`);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to create chat');
    }
  }

  async function saveProject() {
    setErr(null);
    try {
      const res = await api.patch(`/projects/${projectId}`, {
        name, model: model || null, system_prompt: systemPrompt || null, //snake_case
      });
      setProject(res.data);
      useProjects.getState().update(res.data);
      log.info('ui.project.updated', { id: projectId });
      return res.data as Project;
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to save');
      log.error('ui.project.update_failed', { id: projectId });
      throw e;
    }
  }

  async function onSaveAndNewChat(e: React.FormEvent) {
    e.preventDefault();
    try {
      await saveProject();
      await onNewChat();
    } catch {}
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post(`/files`, form, { params: { project_id: projectId }, headers: { 'Content-Type': 'multipart/form-data' } });
      setFiles((fs) => [res.data, ...fs]);
      log.info('ui.file.uploaded', { id: res.data?.id, size: file.size });
    } catch (e: any) {
      const raw = e?.response?.data?.message || e?.message || '';
      let msg = 'Upload failed';
      const lower = String(raw).toLowerCase();
      if (raw === 'unsupported_file_type') msg = 'Unsupported file type. Allowed: text, JSON, XML, JS/TS, PDF, images (images not used in context).';
      else if (lower.includes('file too large') || e?.response?.status === 413) msg = 'File too large (limit 20 MB).';
      else if (raw) msg = raw;
      setErr(msg);
      log.error('ui.file.upload_failed', { name: file.name, raw });
    } finally { setUploading(false); e.target.value = ''; }
  }

  async function onDeleteFile(fid: string) {
    try {
      await api.delete(`/files/${fid}`);
      setFiles((fs) => fs.filter((f) => f.id !== fid));
      log.info('ui.file.deleted', { id: fid });
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Delete failed');
      log.error('ui.file.delete_failed', { id: fid });
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold"><Link to="/" className="underline text-yellow-700">Projects</Link> / {project?.name || 'Project'}</h1>
          <button className="border rounded px-3 py-1" onClick={onDelete}>Delete</button>
        </div>

        {err && <div className="mb-2"><Banner type="error">{err}</Banner></div>}
        {!project && loading && <div>Loading…</div>}

        {project && (
          <div className="grid md:grid-cols-2 gap-6">
            <form onSubmit={onSaveAndNewChat} className="bg-[var(--surface)] rounded shadow p-4 space-y-3">
              <h2 className="font-medium">Project settings</h2>
              <input className="w-full border rounded px-3 py-2" placeholder="Name" value={name} onChange={(e)=>setName(e.target.value)} required />
              <div>
                <label className="block text-sm mb-1">Model</label>
                <select className="w-full border rounded px-3 py-2" value={model} onChange={(e)=>setModel(e.target.value)}>
                  <optgroup label="Free">
                    {freeModels.map((m)=> (<option key={m.id} value={m.id}>{m.label}</option>))}
                  </optgroup>
                  <optgroup label="Paid (BYO Key)">
                    {paidModels.map((m)=> (<option key={m.id} value={m.id}>{m.label}</option>))}
                  </optgroup>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">Paid models require your own OpenRouter API key (handled securely, never sent to providers other than OpenRouter).</p>
              {isPaidSelected && (
                <div className="mt-2 p-3 border rounded bg-yellow-50">
                  <label className="block text-sm mb-1">OpenRouter API key (stored locally)</label>
                  <input
                    type="password"
                    className="w-full border rounded px-3 py-2"
                    placeholder="sk-or-v1-..."
                    value={openrouterKey}
                    onChange={(e)=>setOpenrouterKey(e.target.value)}
                  />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-gray-600">Saved only in this browser. Used as x-openrouter-key header for paid models.</span>
                    <button className="text-xs underline" onClick={onSaveKey}>Save key</button>
                  </div>
                </div>
              )}

              </div>
              <textarea className="w-full border rounded px-3 py-2" placeholder="System prompt" value={systemPrompt} onChange={(e)=>setSystemPrompt(e.target.value)} rows={5} />
              <button className="bg-yellow-400 hover:bg-yellow-500 text-black font-medium rounded px-3 py-2" type="submit">New Chat</button>
            </form>

            <div className="bg-[var(--surface)] rounded shadow p-4 space-y-3">
              <h2 className="font-medium">Files</h2>
              <p className="text-xs text-gray-600">Supported: text/*, JSON, XML, JS/TS. PDF is supported (text-only extraction). Images can be uploaded for preview but aren’t used in context yet.</p>
              <label className="inline-block">
                <span className="border rounded px-3 py-2 cursor-pointer bg-yellow-50">{uploading ? 'Uploading…' : 'Upload file'}</span>
                <input type="file" className="hidden" onChange={onUpload} disabled={uploading} />
              </label>
              <ul className="divide-y">
                {files.map((f) => (
                  <li key={f.id} className="py-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{f.name}</div>
                      <div className="text-sm text-gray-600">{f.mime} · {(f.size/1024).toFixed(1)} KB</div>
                    </div>
                    <button className="text-red-600 underline" onClick={()=>onDeleteFile(f.id)}>Delete</button>
                  </li>
                ))}
                {!files.length && <li className="text-gray-600">No files yet.</li>}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
