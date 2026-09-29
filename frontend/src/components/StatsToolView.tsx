import { useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { computeStatistics } from '../api/endpoints';
import type { FactorizeResult, Statistics } from '../api/types';
import { matrixToText, parseMatrix } from '../lib/matrix';
import { ErrorMessage } from './ErrorMessage';
import { StatisticsPanel } from './StatisticsPanel';

interface Props {
  token: string;
  lastResult: FactorizeResult | null;
  onUnauthorized: () => void;
}

/**
 * Solo admin: llama a la Stats API directamente (POST /api/statistics), sin pasar
 * por la QR API. Sirve para revisar las estadísticas de cualquier par de matrices.
 */
export function StatsToolView({ token, lastResult, onUnauthorized }: Props) {
  const [qText, setQText] = useState('1 0\n0 1');
  const [rText, setRText] = useState('2 1\n0 3');
  const [result, setResult] = useState<Statistics | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const q = useMemo(() => parseMatrix(qText), [qText]);
  const r = useMemo(() => parseMatrix(rText), [rText]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!q.ok || !r.ok) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await computeStatistics(q.matrix, r.matrix, token));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="split">
      <form className="panel" onSubmit={handleSubmit}>
        <div className="panel-head">
          <h2 className="eyebrow">Stats API directa</h2>
          <span className="dim">solo admin</span>
        </div>
        <p className="note">
          Envía Q y R a la Stats API (Node.js) sin pasar por la QR API. Kong solo permite esta ruta al rol admin.
        </p>

        <label htmlFor="stats-q" className="eyebrow">Q</label>
        <textarea id="stats-q" className="matrix-input" rows={4} value={qText} onChange={(e) => setQText(e.target.value)} spellCheck={false} aria-invalid={!q.ok} />
        {!q.ok && <p className="note note-error">{q.error}</p>}

        <label htmlFor="stats-r" className="eyebrow">R</label>
        <textarea id="stats-r" className="matrix-input" rows={4} value={rText} onChange={(e) => setRText(e.target.value)} spellCheck={false} aria-invalid={!r.ok} />
        {!r.ok && <p className="note note-error">{r.error}</p>}

        {lastResult && (
          <button
            type="button"
            className="button-quiet"
            onClick={() => { setQText(matrixToText(lastResult.Q)); setRText(matrixToText(lastResult.R)); }}
          >
            Usar Q y R del último resultado
          </button>
        )}
        <button type="submit" className="button-primary" disabled={!q.ok || !r.ok || loading}>
          {loading ? 'Consultando…' : 'Calcular estadísticas'}
        </button>
      </form>

      <div className="results" aria-live="polite">
        <ErrorMessage error={error} />
        {result
          ? <StatisticsPanel statistics={result} title="Respuesta de la Stats API" source="llamada directa" />
          : !error && <div className="empty"><p>Las estadísticas aparecerán aquí.</p></div>}
      </div>
    </div>
  );
}
