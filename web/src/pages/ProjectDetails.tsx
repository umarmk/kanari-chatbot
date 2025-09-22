import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { log } from '../lib/logger';
import { useProjects } from '../store/projects';

interface Project { id: string; name: string; model?: string|null; systemPrompt?: string|null; createdAt: string; }
interface FileRec { id: string; name: string; size: number; mime: string; createdAt: string; }

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

  const projectId = useMemo(() => id as string, [id]);

  async function load() {
    if (!projectId) return;
    setLoading(true); setErr(null);
    try {
      const [p, f] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/files`, { params: { project_id: projectId } }),
      ]);
      setProject(p.data);
      setName(p.data.name || '');
      setModel(p.data.model || '');
      setSystemPrompt(p.data.systemPrompt || '');
      setFiles(f.data);
      log.info('ui.project.loaded', { id: projectId, files: f.data?.length });
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load project');
      log.error('ui.project.load_failed', { id: projectId });
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try {
      const res = await api.patch(`/projects/${projectId}`, {
        name, model: model || null, system_prompt: systemPrompt || null,
      });
      setProject(res.data);
      // reflect updates in sidebar
      useProjects.getState().update(res.data);
      log.info('ui.project.updated', { id: projectId });
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to save');
      log.error('ui.project.update_failed', { id: projectId });
    }
  }

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
      setErr(e?.response?.data?.message || 'Upload failed');
      log.error('ui.file.upload_failed', { name: file.name });
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

        {err && <div className="text-red-600 text-sm">{err}</div>}
        {!project && loading && <div>Loading…</div>}

        {project && (
          <div className="grid md:grid-cols-2 gap-6">
            <form onSubmit={onSave} className="bg-white rounded shadow p-4 space-y-3">
              <h2 className="font-medium">Project settings</h2>
              <input className="w-full border rounded px-3 py-2" placeholder="Name" value={name} onChange={(e)=>setName(e.target.value)} required />
              <input className="w-full border rounded px-3 py-2" placeholder="Model" value={model} onChange={(e)=>setModel(e.target.value)} />
              <textarea className="w-full border rounded px-3 py-2" placeholder="System prompt" value={systemPrompt} onChange={(e)=>setSystemPrompt(e.target.value)} rows={5} />
              <button className="bg-yellow-400 hover:bg-yellow-500 text-black font-medium rounded px-3 py-2" type="submit">Save</button>
            </form>

            <div className="bg-white rounded shadow p-4 space-y-3">
              <h2 className="font-medium">Files</h2>
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

