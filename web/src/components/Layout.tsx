import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { log } from '../lib/logger';
import { useProjects } from '../store/projects';
import { useChats } from '../store/chats';
import { ChevronDown, ChevronRight, Folder, MessageSquare, Plus, Sun, Moon, Pencil, Trash2 } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';

export default function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const clear = useAuth((s) => s.clear);
  const refreshToken = useAuth((s) => s.refreshToken);

  const { projects, loading, error, load, add } = useProjects();
  const { chatsByProject, loadChats, createChat } = useChats();
  const [newName, setNewName] = useState('');
  const [theme, setTheme] = useState<'light'|'dark'>(() => (localStorage.getItem('theme') as 'light'|'dark') || 'light');

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    try { const raw = localStorage.getItem('sidebar:expanded'); if (raw) setExpanded(JSON.parse(raw)); } catch {}
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
    try { localStorage.setItem('theme', theme); } catch {}
  }, [theme]);
  const activeProjectId = (loc.pathname.match(/\/projects\/([^\/]+)/)?.[1]) || '';
  useEffect(() => { if (activeProjectId) setExpanded((e) => ({ ...e, [activeProjectId]: true })); }, [activeProjectId]);

  function toggleProject(id: string) {
    const willExpand = !expanded[id];
    const next = { ...expanded, [id]: willExpand };
    setExpanded(next);
    try { localStorage.setItem('sidebar:expanded', JSON.stringify(next)); } catch {}
    if (willExpand && !chatsByProject[id]) {
      loadChats(id);
    }
  }

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
      <aside className="w-72 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col max-h-screen rounded-r-xl shadow-[2px_0_12px_rgba(0,0,0,0.06)]">
        <div className="px-4 py-3 bg-[var(--surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface)]/85 sticky top-0 z-10 shadow-[0_1px_0_0_var(--border)] flex items-center justify-between gap-2">
          <Link to="/" className="font-semibold">Kanari</Link>
          <div className="flex items-center gap-3">
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  className="p-2 rounded-md bg-[var(--chip)] border border-[var(--border)] hover:opacity-95"
                  onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
                  aria-label="Toggle theme"
                >{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content side="bottom" align="end" sideOffset={6} className="rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg)] text-xs px-2 py-1 shadow-sm">
                  Toggle theme
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
            <button className="text-sm text-[var(--muted)] hover:text-[var(--fg)]" onClick={onLogout}>Logout</button>
          </div>
        </div>

        <div className="p-3 border-b border-[var(--border)]">
          <form onSubmit={onCreateProject} className="flex gap-2 items-stretch">
            <input className="flex-1 h-9 border border-[var(--border)] bg-[var(--surface-2)] rounded px-3 text-sm" placeholder="New project" value={newName} onChange={(e)=>setNewName(e.target.value)} />
            <button className="h-9 bg-yellow-400 hover:bg-yellow-500 text-black rounded px-3 text-sm inline-flex items-center justify-center gap-1" type="submit"><Plus size={14} /> Add</button>
          </form>
        </div>

        <div className="flex-1 overflow-auto scroll-area">
          <div className="px-3 py-2 text-xs uppercase font-semibold tracking-wide text-[var(--muted)]">Projects</div>
          {loading ? (
            <div className="px-3 py-2 text-sm text-[var(--muted)]">Loading…</div>
          ) : (
            <ul className="list-none m-0 p-0">
              {projects.map((p) => {
                const active = loc.pathname.includes(`/projects/${p.id}`);
                const isExpanded = !!expanded[p.id];
                const chats = chatsByProject[p.id] || [];
                return (
                  <li key={p.id}>
                    <div className="flex flex-col">
                      <div className={`flex items-center justify-between ${active ? 'bg-[var(--row-active)]' : 'hover:bg-[var(--row-hover)]'}`}>
                        <div className="flex items-center flex-1">
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                className="p-1 rounded text-[var(--muted)] hover:bg-[var(--row-hover)]"
                                onClick={() => toggleProject(p.id)}
                                aria-label={isExpanded ? 'Collapse' : 'Expand'}
                              >{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content side="right" align="center" sideOffset={6} className="rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg)] text-xs px-2 py-1 shadow-sm">
                                {isExpanded ? 'Collapse' : 'Expand'}
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                          <Link
                            to={`/projects/${p.id}`}
                            onClick={() => log.info('ui.sidebar.project_selected', { id: p.id })}
                            className={`flex-1 px-1 py-2 text-sm truncate no-underline ${active ? 'font-medium' : ''}`}
                          >
                            <span className="inline-flex items-center gap-2"><Folder size={14} /> {p.name}</span>
                          </Link>
                        </div>
                        {isExpanded && (
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                className="mr-2 p-1 rounded text-[var(--muted)] hover:bg-[var(--row-hover)]"
                                onClick={async () => {
                                  const created = await createChat(p.id, 'New Chat');
                                  nav(`/projects/${p.id}/chats/${created.id}`);
                                }}
                                aria-label="New chat"
                              ><Plus size={14} /></button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content side="left" align="center" sideOffset={6} className="rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg)] text-xs px-2 py-1 shadow-sm">
                                New chat
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        )}
                      </div>
                      {isExpanded && (
                        <ul className="mt-1 list-none m-0 p-0 space-y-1">
                          {chats.map((c) => {
                            const chatActive = loc.pathname.includes(`/chats/${c.id}`);
                            return (
                              <li key={c.id} className="group">
                                <div className="flex items-center">
                                  <Link to={`/projects/${p.id}/chats/${c.id}`} className={`flex-1 block pl-7 pr-3 py-1 text-sm truncate no-underline border-l-2 ${chatActive ? 'bg-[var(--row-active)] border-[var(--accent)]' : 'hover:bg-[var(--row-hover)] border-transparent'}`}><span className="inline-flex items-center gap-2"><MessageSquare size={14} /> {c.title || 'Untitled'}</span></Link>
                                  <Tooltip.Root>
                                    <Tooltip.Trigger asChild>
                                      <button
                                        className="ml-1 p-1 rounded text-[var(--muted)] hover:bg-[var(--row-hover)] opacity-0 group-hover:opacity-100"
                                        onClick={async (e) => {
                                          e.preventDefault();
                                          const name = prompt('Rename chat', c.title || 'Untitled');
                                          if (name != null) {
                                            try {
                                              await api.patch(`/chats/${c.id}`, { title: name || 'Untitled' });
                                              loadChats(p.id);
                                            } catch {}
                                          }
                                        }}
                                        aria-label="Rename chat"
                                      ><Pencil size={14} /></button>
                                    </Tooltip.Trigger>
                                    <Tooltip.Portal>
                                      <Tooltip.Content side="bottom" align="center" sideOffset={6} className="rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg)] text-xs px-2 py-1 shadow-sm">Rename</Tooltip.Content>
                                    </Tooltip.Portal>
                                  </Tooltip.Root>
                                  <Tooltip.Root>
                                    <Tooltip.Trigger asChild>
                                      <button
                                        className="ml-1 p-1 rounded text-red-600 hover:bg-[var(--row-hover)] opacity-0 group-hover:opacity-100"
                                        onClick={async (e) => {
                                          e.preventDefault();
                                          if (!confirm('Delete this chat?')) return;
                                          try {
                                            await api.delete(`/chats/${c.id}`);
                                            loadChats(p.id);
                                            if (loc.pathname.includes(`/chats/${c.id}`)) nav(`/projects/${p.id}`);
                                          } catch {}
                                        }}
                                        aria-label="Delete chat"
                                      ><Trash2 size={14} /></button>
                                    </Tooltip.Trigger>
                                    <Tooltip.Portal>
                                      <Tooltip.Content side="bottom" align="center" sideOffset={6} className="rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg)] text-xs px-2 py-1 shadow-sm">Delete</Tooltip.Content>
                                    </Tooltip.Portal>
                                  </Tooltip.Root>
                                </div>
                              </li>
                            );
                          })}
                          {chats.length === 0 && (
                            <li className="pl-7 pr-3 py-1 text-xs text-[var(--muted)]">No chats</li>
                          )}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
              {!projects.length && <li className="px-3 py-2 text-sm text-[var(--muted)]">No projects yet</li>}
            </ul>
          )}
          {error && <div className="px-3 py-2 text-xs text-red-600">{error}</div>}
        </div>

        <div className="px-3 py-3 border-t text-xs text-[var(--muted)]">
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

