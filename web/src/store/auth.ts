import { create } from 'zustand';

interface AuthState {
  accessToken?: string;
  refreshToken?: string;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clear: () => void;
  isAuthenticated: () => boolean;
}

const STORAGE_KEY = 'kanari.auth.tokens';

function loadFromStorage(): { accessToken?: string; refreshToken?: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export const useAuth = create<AuthState>((set, get) => {
  const init = loadFromStorage();
  return {
    accessToken: init.accessToken,
    refreshToken: init.refreshToken,
    setTokens: (accessToken, refreshToken) => {
      set({ accessToken, refreshToken });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, refreshToken }));
    },
    clear: () => {
      set({ accessToken: undefined, refreshToken: undefined });
      localStorage.removeItem(STORAGE_KEY);
    },
    isAuthenticated: () => !!get().accessToken,
  };
});

