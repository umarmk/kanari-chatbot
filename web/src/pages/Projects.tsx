import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { log } from '../lib/logger';
import { Banner } from '../components/Banner';

interface Project { id: string; name: string; model?: string|null; systemPrompt?: string|null; createdAt: string; }

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string|null>(null);

  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [model, setModel] = useState('x-ai/grok-4-fast:free');

  async function load() {
    setLoading(true); setErr(null);
    try {
      const res = await api.get('/projects');
      setProjects(res.data);
      log.info('ui.projects.loaded', { count: res.data?.length });
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load projects');
      log.error('ui.projects.load_failed', { msg: err });
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try {
      const res = await api.post('/projects', { name, system_prompt: systemPrompt || undefined, model: model || undefined });
      log.info('ui.projects.created', { id: res.data?.id });
      setName(''); setSystemPrompt('');
      setProjects((p) => [res.data, ...p]);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to create project');
      log.error('ui.projects.create_failed', { err: String(e) });
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Your Projects</h1>

        <div className="bg-[var(--surface)] rounded shadow p-4 mb-6">
          <h2 className="font-medium mb-2">Create a project</h2>
          {err && <div className="mb-2"><Banner type="error">{err}</Banner></div>}
          <form onSubmit={onCreate} className="space-y-3">
            <input className="w-full border rounded px-3 py-2" placeholder="Name" value={name} onChange={(e)=>setName(e.target.value)} required />
            <input className="w-full border rounded px-3 py-2" placeholder="Model (optional)" value={model} onChange={(e)=>setModel(e.target.value)} />
            <textarea className="w-full border rounded px-3 py-2" placeholder="System prompt (optional)" value={systemPrompt} onChange={(e)=>setSystemPrompt(e.target.value)} rows={3} />
            <button className="bg-yellow-400 hover:bg-yellow-500 text-black font-medium rounded px-3 py-2" type="submit">Create</button>
          </form>
        </div>

        <div className="bg-[var(--surface)] rounded shadow">
          <div className="px-4 py-3 border-b font-medium">Projects</div>
          {loading ? (
            <div className="p-4">Loading…</div>
          ) : (
            <ul className="divide-y">
              {projects.map((p) => (
                <li key={p.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-sm text-gray-600">{p.model || 'default model'}</div>
                  </div>
                  <Link className="underline" to={`/projects/${p.id}`}>Open</Link>
                </li>
              ))}
              {!projects.length && <li className="p-4 text-gray-600">No projects yet. Create one above.</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

