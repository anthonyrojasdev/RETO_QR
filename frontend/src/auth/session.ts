import { createContext, useContext } from 'react';
import type { Session } from '../api/types';

const STORAGE_KEY = 'reto-qr.session';

export interface AuthContextValue {
  session: Session | null;
  login: (username: string, password: string) => Promise<void>;
  /** Cierra la sesión; el mensaje opcional explica por qué (p. ej. token expirado). */
  logout: (reason?: string) => void;
  /** Motivo del último cierre de sesión automático. */
  logoutReason: string | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Acceso a la sesión desde cualquier componente dentro de AuthProvider. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return value;
}

/**
 * La sesión se guarda en sessionStorage: sobrevive a recargar la página pero se
 * borra al cerrar la pestaña. Un token expirado se descarta al leerlo.
 */
export function loadSession(now = Date.now()): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    return session.expiresAt > now ? session : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin almacenamiento (modo privado estricto): la sesión vive solo en memoria.
  }
}
