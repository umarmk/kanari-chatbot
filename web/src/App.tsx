import { Link, Route, Routes } from 'react-router-dom'
import './App.css'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import AuthCallback from './pages/AuthCallback'
import Protected from './components/Protected'
import { useAuth } from './store/auth'

import { api } from './lib/api'
function Home() {
  const clear = useAuth((s) => s.clear)
  const isAuthed = useAuth((s) => s.isAuthenticated())
  const refreshToken = useAuth((s) => s.refreshToken)
  async function onLogout() {
    try { if (refreshToken) await api.post('/auth/logout', { refresh_token: refreshToken }) } catch {}
    clear()
  }
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Kanari</h1>
          <div className="space-x-3">
            {isAuthed ? (
              <button className="border rounded px-3 py-1" onClick={onLogout}>Logout</button>
            ) : (
              <>
                <Link className="underline" to="/auth/sign-in">Sign in</Link>
                <Link className="underline" to="/auth/sign-up">Sign up</Link>
              </>
            )}
          </div>
        </div>
        <div className="mt-8">Welcome! This is a protected home page placeholder.</div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Protected />}>
        <Route index element={<Home />} />
      </Route>
      <Route path="/auth/sign-in" element={<SignIn />} />
      <Route path="/auth/sign-up" element={<SignUp />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
    </Routes>
  )
}
