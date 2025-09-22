import { create } from 'zustand';
import { api } from '../lib/api';
import { log } from '../lib/logger';

export interface Project { id: string; name: string; model?: string|null; systemPrompt?: string|null; createdAt?: string }

interface ProjectsState {
  projects: Project[];
  loading: boolean;
  error?: string | null;
  load: () => Promise<void>;
  add: (p: Project) => void;
  remove: (id: string) => void;
  update: (p: Project) => void;
  clear: () => void;
}

export const useProjects = create<ProjectsState>((set) => ({
  projects: [],
  loading: false,
  error: null,
  async load() {
    set({ loading: true, error: null });
    try {
      const res = await api.get('/projects');
      set({ projects: res.data, loading: false });
      log.info('projects.load.ok', { count: res.data?.length });
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to load projects';
      set({ error: msg, loading: false });
      log.error('projects.load.err', { msg });
    }
  },
  add(p) {
    set((s) => ({ projects: [p, ...s.projects] }));
  },
  remove(id) {
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  },
  update(p) {
    set((s) => ({ projects: s.projects.map((x) => (x.id === p.id ? { ...x, ...p } : x)) }));
  },
  clear() {
    set({ projects: [], error: null, loading: false });
  },
}));

