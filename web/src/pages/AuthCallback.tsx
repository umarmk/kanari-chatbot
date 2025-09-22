import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';

export default function AuthCallback() {
  const nav = useNavigate();
  const setTokens = useAuth((s) => s.setTokens);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Prefer hash (server sends tokens in fragment), but fall back to query if needed
    const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : window.location.hash || '';
    const search = window.location.search?.startsWith('?') ? window.location.search.slice(1) : window.location.search || '';
    const params = new URLSearchParams(hash || search);

    const at = params.get('access_token');
    const rt = params.get('refresh_token');

    if (at && rt) {
      setTokens(at, rt);
      // Small delay to ensure state flush before navigating
      setTimeout(() => nav('/'), 0);
    } else {
      setError('Missing tokens in callback');
      setTimeout(() => nav('/auth/sign-in'), 800);
    }
  }, [nav, setTokens]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--fg)] p-6">
      <div className="bg-white shadow rounded p-6">
        {error ? `Sign-in failed: ${error}` : 'Finishing sign-in…'}
      </div>
    </div>
  );
}

