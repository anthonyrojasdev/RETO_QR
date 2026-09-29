import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { fetchHistory, fetchUsage } from '../api/endpoints';
import type { HistoryEntry, Usage } from '../api/types';
import { formatRelative } from '../lib/export';
import { formatNumber } from '../lib/matrix';
import { ErrorMessage } from './ErrorMessage';

interface Props {
  token: string;
  onOpen: (entry: HistoryEntry) => void;
  onUnauthorized: () => void;
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; usage: Usage; recent: HistoryEntry[] }
  | { status: 'error'; error: unknown };

const percent = (part: number, total: number) => (total === 0 ? '—' : `${Math.round((part / total) * 100)}\u202f%`);

/** Solo admin: uso del servicio por usuario y últimos cálculos de todo el equipo. */
export function ActivityView({ token, onOpen, onUnauthorized }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([fetchUsage(token), fetchHistory(token, { scope: 'all', limit: 25 })])
      .then(([usage, recent]) => { if (active) setState({ status: 'ready', usage, recent }); })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          onUnauthorized();
          return;
        }
        setState({ status: 'error', error });
      });
    return () => { active = false; };
  }, [token, reload, onUnauthorized]);

  if (state.status === 'loading') return <p className="note">Cargando actividad…</p>;
  if (state.status === 'error') return <ErrorMessage error={state.error} />;

  const { usage, recent } = state;
  return (
    <div className="results">
      <section className="panel" aria-label="Resumen de uso">
        <div className="panel-head">
          <h2 className="eyebrow">Uso del servicio</h2>
          <button type="button" className="button-quiet" onClick={() => { setState({ status: 'loading' }); setReload((n) => n + 1); }}>
            Actualizar
          </button>
        </div>
        <dl className="figures">
          <div><dt>Factorizaciones</dt><dd>{usage.total}</dd></div>
          <div><dt>Usuarios activos</dt><dd>{usage.users.length}</dd></div>
          <div><dt>Servidas desde caché</dt><dd>{percent(usage.cacheHits, usage.total)}</dd></div>
        </dl>

        {usage.users.length > 0 && (
          <table className="data-table">
            <thead>
              <tr><th>Usuario</th><th className="num">Cálculos</th><th className="num">Desde caché</th><th>Último</th></tr>
            </thead>
            <tbody>
              {usage.users.map((user) => (
                <tr key={user.username}>
                  <td>{user.username}</td>
                  <td className="num">{user.count}</td>
                  <td className="num">{percent(user.cacheHits, user.count)}</td>
                  <td className="dim">{formatRelative(user.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel" aria-label="Cálculos recientes del equipo">
        <div className="panel-head">
          <h2 className="eyebrow">Cálculos recientes del equipo</h2>
          <span className="dim">últimos {recent.length}</span>
        </div>
        {recent.length === 0
          ? <p className="note">Nadie ha calculado nada todavía.</p>
          : (
            <table className="data-table">
              <thead>
                <tr><th>Cuándo</th><th>Usuario</th><th>Tamaño</th><th className="num">Máx</th><th className="num">Mín</th><th>Origen</th><th /></tr>
              </thead>
              <tbody>
                {recent.map((entry) => (
                  <tr key={entry.id}>
                    <td className="dim" title={new Date(entry.createdAt).toLocaleString('es')}>{formatRelative(entry.createdAt)}</td>
                    <td>{entry.username}</td>
                    <td className="mono">{entry.rows}×{entry.columns}</td>
                    <td className="num">{formatNumber(entry.statistics.max, 2)}</td>
                    <td className="num">{formatNumber(entry.statistics.min, 2)}</td>
                    <td className="dim">{entry.cached ? 'caché' : 'cálculo'}</td>
                    <td><button type="button" className="button-link" onClick={() => onOpen(entry)}>Abrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>
    </div>
  );
}
