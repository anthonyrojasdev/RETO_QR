import { useCallback, useState } from 'react';
import { ApiError } from '../api/client';
import { factorize } from '../api/endpoints';
import type { FactorizeResult, HistoryEntry, Matrix, Session } from '../api/types';
import { useAuth } from '../auth/session';
import { EXAMPLES, matrixToText } from '../lib/matrix';
import { ErrorMessage } from './ErrorMessage';
import { HistoryPanel } from './HistoryPanel';
import { MatrixEditor } from './MatrixEditor';
import { ResultView } from './ResultView';

const ROLE_LABELS: Record<Session['role'], string> = { admin: 'Administrador', analyst: 'Analista' };

export function Dashboard({ session }: { session: Session }) {
  const { logout } = useAuth();
  const [matrixText, setMatrixText] = useState(() => matrixToText(EXAMPLES[0].matrix));
  const [result, setResult] = useState<FactorizeResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

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

  function handleSelectHistory(entry: HistoryEntry) {
    setMatrixText(matrixToText(entry.matrix));
    setError(null);
    setResult({ ...entry, requestId: null });
  }

  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">QR</span>
          <div>
            <h1>Factorización QR</h1>
            <p className="muted small">A = Q·R con Go (Gonum) · estadísticas con Node.js · vía Kong</p>
          </div>
        </div>
        <div className="user">
          <span><strong>{session.username}</strong> <span className="badge">{ROLE_LABELS[session.role]}</span></span>
          <button type="button" className="button-secondary" onClick={() => logout()}>Cerrar sesión</button>
        </div>
      </header>

      <main className="content">
        <aside className="sidebar">
          <MatrixEditor value={matrixText} onChange={setMatrixText} onSubmit={handleSubmit} loading={loading} />
          <HistoryPanel
            token={session.token}
            refreshKey={historyVersion}
            onSelect={handleSelectHistory}
            onUnauthorized={handleUnauthorized}
          />
        </aside>

        <section className="main" aria-live="polite">
          <ErrorMessage error={error} />
          {result
            ? <ResultView result={result} />
            : !error && (
              <div className="card empty">
                <h2>Sin resultados todavía</h2>
                <p className="muted">Escribe una matriz o elige un ejemplo y pulsa <strong>Calcular factorización QR</strong>.</p>
              </div>
            )}
        </section>
      </main>
    </div>
  );
}
