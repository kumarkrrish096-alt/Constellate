import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { DEFAULT_USER } from '../config';
import { getUser, logout as authLogout, restoreSession } from './AuthService';

const Ctx = createContext(null);

export const initials = (n) => {
  const w = String(n || '').trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || 'K').slice(0, 2)).toUpperCase();
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => getUser());
  const [loading, setLoading] = useState(true);

  // Sync state when login, logout, or session refresh occurs
  useEffect(() => {
    let cancelled = false;

    const handleAuthChange = (e) => {
      setCurrentUser(e.detail !== undefined ? e.detail : getUser());
    };

    const handleStorageChange = (e) => {
      if (e.key === 'constellate_user') {
        setCurrentUser(getUser());
      }
    };

    window.addEventListener('constellate_auth', handleAuthChange);
    window.addEventListener('storage', handleStorageChange);

    // Verify session with backend on initial load / refresh
    restoreSession()
      .then((user) => {
        if (!cancelled) {
          setCurrentUser(user || getUser());
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentUser(getUser());
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      window.removeEventListener('constellate_auth', handleAuthChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await authLogout();
    } catch (e) {
      console.warn('Logout failed:', e);
    }
    setCurrentUser(null);
  }, []);

  const displayName = currentUser?.name?.trim() || (currentUser?.email ? currentUser.email.split('@')[0] : DEFAULT_USER);
  const displayEmail = currentUser?.email || '';
  const isAuthenticated = !!currentUser;

  const value = {
    user: displayName,
    email: displayEmail,
    rawUser: currentUser,
    isAuthenticated,
    loading,
    logout,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
