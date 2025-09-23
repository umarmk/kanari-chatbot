import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useProjects } from '../store/projects';
import { MessageSquare, Paperclip, FileText, Sun, Plus } from 'lucide-react';

export default function Welcome() {
  const nav = useNavigate();
  const addProject = useProjects((s)=>s.add);
  const [creating, setCreating] = useState(false);

  async function createProject() {
    const name = prompt('Project name', 'New project');
    if (!name || !name.trim()) return;
    setCreating(true);
    try {
      const res = await api.post('/projects', { name: name.trim() });
      addProject(res.data);
      nav(`/projects/${res.data.id}`);
    } catch (e) {
      alert('Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm p-8 md:p-10 text-center">
          <div className="inline-flex items-center justify-center rounded-full bg-[var(--chip)] border border-[var(--border)] w-12 h-12 mb-4 shadow-sm">
            <MessageSquare size={18} />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">Welcome to Kanari</h1>
          <p className="text-[var(--muted)] max-w-2xl mx-auto mb-6">
            Create a project on the left to start chatting, upload context files, and get modern Markdown-rendered replies in a sleek dark/light UI.
          </p>
          <div className="flex items-center justify-center">
            <button onClick={createProject} disabled={creating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-yellow-400 hover:bg-yellow-500 text-black border border-yellow-300 shadow-sm disabled:opacity-60">
              <Plus size={16} /> {creating ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-8">
          <FeatureCard icon={<MessageSquare size={16} />} title="Real-time chat">
            Streamed responses with tidy message grouping.
          </FeatureCard>
          <FeatureCard icon={<Paperclip size={16} />} title="File uploads">
            Attach text, JSON, PDF, and images to ground answers.
          </FeatureCard>
          <FeatureCard icon={<FileText size={16} />} title="Markdown">
            Clean GitHub-style rendering for code and docs.
          </FeatureCard>
          <FeatureCard icon={<Sun size={16} />} title="Themes">
            Polished light/dark modes with accessible contrasts.
          </FeatureCard>
          <FeatureCard icon={<MessageSquare size={16} />} title="Model badges">
            Free/Paid indicators and key status chips.
          </FeatureCard>
          <FeatureCard icon={<Paperclip size={16} />} title="Modern UX">
            Icons, tooltips, and subtle depth for a pro feel.
          </FeatureCard>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2 text-[var(--fg)]"><span className="inline-flex w-7 h-7 items-center justify-center rounded-md bg-[var(--chip)] border border-[var(--border)]">{icon}</span><span className="font-semibold">{title}</span></div>
      <div className="text-sm text-[var(--muted)]">{children}</div>
    </div>
  );
}
