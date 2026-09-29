import { useCallback, useState } from 'react';
import { ApiError } from '../api/client';
import { factorize } from '../api/endpoints';
import type { FactorizeResult, HistoryEntry, Matrix, Session } from '../api/types';
import { useAuth } from '../auth/session';
import { EXAMPLES, matrixToText } from '../lib/matrix';
import { ActivityView } from './ActivityView';
import { ErrorMessage } from './ErrorMessage';
import { HistoryPanel } from './HistoryPanel';
import { MatrixEditor } from './MatrixEditor';
import { ResultView } from './ResultView';
import { StatsToolView } from './StatsToolView';

type View = 'factorize' | 'activity' | 'stats';

const ROLE_LABELS: Record<Session['role'], string> = { admin: 'administrador', analyst: 'analista' };

/** Vistas por rol: analyst solo factoriza; admin además ve la actividad del equipo y usa la Stats API directa. */
const VIEWS: Record<Session['role'], { id: View; label: string }[]> = {
  analyst: [{ id: 'factorize', label: 'Factorizar' }],
  admin: [
    { id: 'factorize', label: 'Factorizar' },
    { id: 'activity', label: 'Actividad del equipo' },
    { id: 'stats', label: 'Stats API' },
  ],
};

export function Dashboard({ session }: { session: Session }) {
  const { logout } = useAuth();
  const [view, setView] = useState<View>('factorize');
  const [matrixText, setMatrixText] = useState(() => matrixToText(EXAMPLES[0].matrix));
  const [result, setResult] = useState<FactorizeResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const views = VIEWS[session.role];

  const handleUnauthorized = useCallback(
    () => logout('Tu sesión expiró o no es válida. Vuelve a iniciar sesión.'),
    [logout],
  );

  async function handleSubmit(matrix: Matrix) {
    setLoading(true);
    setError(null);
    try {
      setResult(await factorize(matrix, session.token));
      setHistoryVersion((version) => version + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  function openEntry(entry: HistoryEntry) {
    setMatrixText(matrixToText(entry.matrix));
    setError(null);
    setResult({ ...entry, requestId: null });
    setView('factorize');
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="wordmark">
          <span className="mono">A = Q·R</span>
          <span className="dim">Factorización QR</span>
        </div>

        {views.length > 1 && (
          <nav className="tabs" aria-label="Secciones">
            {views.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => setView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}

        <div className="user">
          <span><strong>{session.username}</strong> <span className="dim">· {ROLE_LABELS[session.role]}</span></span>
          <button type="button" className="button-link" onClick={() => logout()}>Salir</button>
        </div>
      </header>

      <main>
        {view === 'factorize' && (
          <div className="split">
            <aside className="side">
              <MatrixEditor value={matrixText} onChange={setMatrixText} onSubmit={handleSubmit} loading={loading} />
              <HistoryPanel
                token={session.token}
                role={session.role}
                refreshKey={historyVersion}
                onSelect={openEntry}
                onUnauthorized={handleUnauthorized}
              />
            </aside>
            <section className="results" aria-live="polite">
              <ErrorMessage error={error} />
              {result
                ? <ResultView result={result} />
                : !error && (
                  <div className="empty">
                    <p>Escribe una matriz o elige un ejemplo y pulsa <strong>Calcular</strong>.</p>
                    <p className="dim">Q y R aparecerán aquí, junto con sus estadísticas.</p>
                  </div>
                )}
            </section>
          </div>
        )}
        {view === 'activity' && <ActivityView token={session.token} onOpen={openEntry} onUnauthorized={handleUnauthorized} />}
        {view === 'stats' && <StatsToolView token={session.token} lastResult={result} onUnauthorized={handleUnauthorized} />}
      </main>
    </div>
  );
}
