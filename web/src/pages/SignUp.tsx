import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { useNavigate, Link } from 'react-router-dom';
import { Banner } from '../components/Banner';

export default function SignUp() {
  const nav = useNavigate();
  const setTokens = useAuth((s) => s.setTokens);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const googleUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/auth/google/start`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const res = await api.post('/auth/register', { email, password });
      setTokens(res.data.access_token, res.data.refresh_token);
      nav('/');
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Sign up failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--fg)] p-6">
      <div className="w-full max-w-sm bg-[var(--surface)] shadow rounded p-6 space-y-4">
        <h1 className="text-xl font-semibold">Create account</h1>
        {err && <Banner type="error">{String(err)}</Banner>}
        <form onSubmit={onSubmit} className="space-y-3">
          <input className="w-full border rounded px-3 py-2" type="email" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
          <input className="w-full border rounded px-3 py-2" type="password" placeholder="Password (min 12 chars)" value={password} onChange={(e)=>setPassword(e.target.value)} required />
          <button className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-medium rounded px-3 py-2" type="submit">Sign up</button>
        </form>
        <button className="w-full border rounded px-3 py-2" onClick={()=> window.location.href = googleUrl}>
          Continue with Google
        </button>
        <div className="text-sm text-gray-600">Have an account? <Link className="underline" to="/auth/sign-in">Sign in</Link></div>
      </div>
    </div>
  );
}

