import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { log } from '../lib/logger';
import { useProjects } from '../store/projects';

export default function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const clear = useAuth((s) => s.clear);
  const refreshToken = useAuth((s) => s.refreshToken);

  const { projects, loading, error, load, add } = useProjects();
  const [newName, setNewName] = useState('');

  useEffect(() => { load(); }, [load]);

  async function onCreateProject(e: React.FormEvent) {
    e.preventDefault(); if (!newName.trim()) return;
    try {
      const res = await api.post('/projects', { name: newName.trim() });
      add(res.data);
      setNewName('');
      log.info('ui.sidebar.project_created', { id: res.data?.id });
      nav(`/projects/${res.data.id}`);
    } catch (e: any) {
      log.error('ui.sidebar.project_create_failed');
      alert(e?.response?.data?.message || 'Failed to create project');
    }
  }

  async function onLogout() {
    try { if (refreshToken) await api.post('/auth/logout', { refresh_token: refreshToken }); } catch {}
    clear();
    nav('/auth/sign-in');
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)] flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r bg-white flex flex-col max-h-screen">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <Link to="/" className="font-semibold">Kanari</Link>
          <button className="text-sm underline" onClick={onLogout}>Logout</button>
        </div>

        <div className="p-3 border-b">
          <form onSubmit={onCreateProject} className="flex gap-2">
            <input className="flex-1 border rounded px-2 py-1 text-sm" placeholder="New project" value={newName} onChange={(e)=>setNewName(e.target.value)} />
            <button className="bg-yellow-400 hover:bg-yellow-500 text-black rounded px-2 py-1 text-sm" type="submit">Add</button>
          </form>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="px-3 py-2 text-xs uppercase text-gray-600">Projects</div>
          {loading ? (
            <div className="px-3 py-2 text-sm">Loading…</div>
          ) : (
            <ul>
              {projects.map((p) => {
                const active = loc.pathname.includes(p.id);
                return (
                  <li key={p.id}>
                    <Link
                      to={`/projects/${p.id}`}
                      onClick={() => log.info('ui.sidebar.project_selected', { id: p.id })}
                      className={`block px-3 py-2 text-sm truncate ${active ? 'bg-yellow-100' : 'hover:bg-yellow-50'}`}
                    >
                      {p.name}
                    </Link>
                  </li>
                );
              })}
              {!projects.length && <li className="px-3 py-2 text-sm text-gray-600">No projects yet</li>}
            </ul>
          )}
          {error && <div className="px-3 py-2 text-xs text-red-600">{error}</div>}
        </div>

        <div className="px-3 py-3 border-t text-xs text-gray-600">
          Built with ❤️
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}

