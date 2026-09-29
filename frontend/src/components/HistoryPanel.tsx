import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { fetchHistory, fetchUsage } from '../api/endpoints';
import type { HistoryEntry, Role } from '../api/types';
import { formatRelative } from '../lib/export';
import { formatNumber } from '../lib/matrix';

interface Props {
  token: string;
  role: Role;
  /** Cambia después de cada cálculo para volver a cargar el historial. */
  refreshKey: number;
  onSelect: (entry: HistoryEntry) => void;
  onUnauthorized: () => void;
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; items: HistoryEntry[] }
  | { status: 'error'; message: string };

/** Valor del selector: "mine", "all" o "user:<nombre>". */
type Source = string;

function query(source: Source) {
  if (source === 'all') return { scope: 'all' as const, limit: 15 };
  if (source.startsWith('user:')) return { user: source.slice(5), limit: 15 };
  return {};
}

/**
 * Historial guardado por la QR API en PostgreSQL. analyst solo ve el suyo;
 * admin puede cambiar al de todo el equipo o al de cualquier usuario.
 */
export function HistoryPanel({ token, role, refreshKey, onSelect, onUnauthorized }: Props) {
  const isAdmin = role === 'admin';
  const [source, setSource] = useState<Source>('mine');
  const [users, setUsers] = useState<string[]>([]);
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    fetchUsage(token)
      .then((usage) => { if (active) setUsers(usage.users.map((u) => u.username)); })
      .catch(() => { /* sin la lista de usuarios, el selector ofrece solo "Mío" y "Todo el equipo" */ });
    return () => { active = false; };
  }, [isAdmin, token, refreshKey]);

  useEffect(() => {
    let active = true;
    fetchHistory(token, query(source))
      .then((items) => { if (active) setState({ status: 'ready', items }); })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          onUnauthorized();
          return;
        }
        setState({ status: 'error', message: err instanceof Error ? err.message : 'No se pudo cargar el historial.' });
      });
    return () => { active = false; };
  }, [token, source, refreshKey, onUnauthorized]);

  const showAuthor = source !== 'mine';

  return (
    <section className="panel" aria-labelledby="history-title">
      <div className="panel-head">
        <h2 id="history-title" className="eyebrow">{isAdmin ? 'Historial' : 'Tu historial'}</h2>
        {isAdmin
          ? (
            <label className="field inline">
              <span className="visually-hidden">Historial de</span>
              <select
                value={source}
                onChange={(e) => { setState({ status: 'loading' }); setSource(e.target.value); }}
              >
                <option value="mine">Mío</option>
                <option value="all">Todo el equipo</option>
                {users.length > 0 && (
                  <optgroup label="Usuario">
                    {users.map((name) => <option key={name} value={`user:${name}`}>{name}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
          )
          : <span className="dim">PostgreSQL</span>}
      </div>

      {state.status === 'loading' && <p className="note">Cargando…</p>}
      {state.status === 'error' && <p className="note">{state.message}</p>}
      {state.status === 'ready' && state.items.length === 0 && (
        <p className="note">{source === 'mine' ? 'Aún no hay cálculos. Los que hagas aparecerán aquí.' : 'Sin cálculos para esta selección.'}</p>
      )}
      {state.status === 'ready' && state.items.length > 0 && (
        <ul className={showAuthor ? 'history with-author' : 'history'}>
          {state.items.map((entry) => (
            <li key={entry.id}>
              <button type="button" onClick={() => onSelect(entry)} title="Volver a abrir este cálculo">
                <span className="mono">{entry.rows}×{entry.columns}</span>
                {showAuthor && <span className="author">{entry.username}</span>}
                {!showAuthor && <span className="dim mono">máx {formatNumber(entry.statistics.max, 2)}</span>}
                <span className="dim">{formatRelative(entry.createdAt)}{entry.cached ? ' · caché' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
