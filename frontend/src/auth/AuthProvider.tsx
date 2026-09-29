import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { login as loginRequest } from '../api/endpoints';
import type { Session } from '../api/types';
import { AuthContext, loadSession, saveSession, type AuthContextValue } from './session';

/** Mantiene la sesión del usuario y la cierra automáticamente cuando el token expira. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [logoutReason, setLogoutReason] = useState<string | null>(null);

  const logout = useCallback((reason?: string) => {
    saveSession(null);
    setSession(null);
    setLogoutReason(reason ?? null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await loginRequest(username, password);
    const next: Session = {
      token: response.accessToken,
      username: response.user.username,
      role: response.user.role,
      expiresAt: Date.now() + response.expiresIn * 1000,
    };
    saveSession(next);
    setSession(next);
    setLogoutReason(null);
  }, []);

  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => logout('Tu sesión expiró. Vuelve a iniciar sesión.'),
      Math.max(0, session.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session, logout]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, login, logout, logoutReason }),
    [session, login, logout, logoutReason],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
