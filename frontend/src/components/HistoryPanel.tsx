import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { fetchHistory } from '../api/endpoints';
import type { HistoryEntry } from '../api/types';
import { formatRelative } from '../lib/export';
import { formatNumber } from '../lib/matrix';

interface Props {
  token: string;
  /** Cambia después de cada cálculo para volver a cargar el historial. */
  refreshKey: number;
  onSelect: (entry: HistoryEntry) => void;
  onUnauthorized: () => void;
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; items: HistoryEntry[] }
  | { status: 'error'; message: string };

/** Últimas factorizaciones del usuario, guardadas por la QR API en PostgreSQL. */
export function HistoryPanel({ token, refreshKey, onSelect, onUnauthorized }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    fetchHistory(token)
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
  }, [token, refreshKey, onUnauthorized]);

  return (
    <section className="panel" aria-labelledby="history-title">
      <div className="panel-head">
        <h2 id="history-title" className="eyebrow">Tu historial</h2>
        <span className="dim">PostgreSQL</span>
      </div>

      {state.status === 'loading' && <p className="note">Cargando…</p>}
      {state.status === 'error' && <p className="note">{state.message}</p>}
      {state.status === 'ready' && state.items.length === 0 && (
        <p className="note">Aún no hay cálculos. Los que hagas aparecerán aquí.</p>
      )}
      {state.status === 'ready' && state.items.length > 0 && (
        <ul className="history">
          {state.items.map((entry) => (
            <li key={entry.id}>
              <button type="button" onClick={() => onSelect(entry)} title="Volver a abrir este cálculo">
                <span className="mono">{entry.rows}×{entry.columns}</span>
                <span className="dim mono">máx {formatNumber(entry.statistics.max, 2)}</span>
                <span className="dim">{formatRelative(entry.createdAt)}{entry.cached ? ' · caché' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
