import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../store/auth';

export default function Protected() {
  const isAuthed = useAuth((s) => s.isAuthenticated());
  return isAuthed ? <Outlet /> : <Navigate to="/auth/sign-in" replace />;
}

