import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { log } from '../lib/logger';
import { useProjects } from '../store/projects';
import { useChats } from '../store/chats';

export default function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const clear = useAuth((s) => s.clear);
  const refreshToken = useAuth((s) => s.refreshToken);

  const { projects, loading, error, load, add } = useProjects();
  const { chatsByProject, loadChats, createChat } = useChats();
  const [newName, setNewName] = useState('');

  useEffect(() => { load(); }, [load]);
  const activeProjectId = (loc.pathname.match(/\/projects\/([^\/]+)/)?.[1]) || '';
  useEffect(() => { if (activeProjectId) loadChats(activeProjectId); }, [activeProjectId, loadChats]);

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
            <ul className="list-none m-0 p-0">
              {projects.map((p) => {
                const active = loc.pathname.includes(p.id);
                return (
                  <li key={p.id}>
                    <div className="flex flex-col">
                      <Link
                        to={`/projects/${p.id}`}
                        onClick={() => log.info('ui.sidebar.project_selected', { id: p.id })}
                        className={`block px-3 py-2 text-sm truncate no-underline ${active ? 'bg-yellow-100' : 'hover:bg-yellow-50'}`}
                      >
                        {p.name}
                      </Link>
                      {active && (
                        <div className="pl-2 pb-2">
                          <div className="flex items-center justify-between pr-3">
                            <div className="text-xs uppercase text-gray-500">Chats</div>
                            <button
                              className="text-xs text-blue-700 hover:underline"
                              onClick={async () => {
                                const created = await createChat(p.id, 'New Chat');
                                nav(`/projects/${p.id}/chats/${created.id}`);
                              }}
                            >New</button>
                          </div>
                          <ul className="mt-1 list-none m-0 p-0 space-y-1">
                            {(chatsByProject[p.id]||[]).map((c) => {
                              const chatActive = loc.pathname.includes(`/chats/${c.id}`);
                              return (
                                <li key={c.id} className="group">
                                  <div className="flex items-center">
                                    <Link to={`/projects/${p.id}/chats/${c.id}`} className={`flex-1 block px-3 py-1 text-sm truncate no-underline ${chatActive ? 'bg-yellow-50' : 'hover:bg-yellow-50'}`}>{c.title || 'Untitled'}</Link>
                                    <button
                                      className="ml-1 text-xs text-gray-600 hover:text-gray-900 opacity-0 group-hover:opacity-100"
                                      title="Rename"
                                      onClick={async (e) => {
                                        e.preventDefault();
                                        const name = prompt('Rename chat', c.title || 'Untitled');
                                        if (name != null) {
                                          try {
                                            await api.patch(`/chats/${c.id}`, { title: name || 'Untitled' });
                                            // naive refresh
                                            loadChats(p.id);
                                          } catch {}
                                        }
                                      }}
                                    >✎</button>
                                    <button
                                      className="ml-1 text-xs text-red-600 hover:text-red-800 opacity-0 group-hover:opacity-100"
                                      title="Delete"
                                      onClick={async (e) => {
                                        e.preventDefault();
                                        if (!confirm('Delete this chat?')) return;
                                        try {
                                          await api.delete(`/chats/${c.id}`);
                                          loadChats(p.id);
                                          if (loc.pathname.includes(`/chats/${c.id}`)) nav(`/projects/${p.id}`);
                                        } catch {}
                                      }}
                                    >✕</button>
                                  </div>
                                </li>
                              );
                            })}
                            {(!chatsByProject[p.id] || chatsByProject[p.id].length===0) && (
                              <li className="px-3 py-1 text-xs text-gray-500">No chats</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
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
      <main className="flex-1 min-w-0 flex flex-col h-screen">
        <Outlet />
      </main>
    </div>
  );
}

