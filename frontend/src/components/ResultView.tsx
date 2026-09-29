import { useMemo } from 'react';
import type { FactorizeResult } from '../api/types';
import { formatError, verifyFactorization } from '../lib/matrix';
import { MatrixTable } from './MatrixTable';
import { StatisticsPanel } from './StatisticsPanel';

/** Resultado completo: estadísticas, A, Q, R y la verificación A ≈ Q·R. */
export function ResultView({ result }: { result: FactorizeResult }) {
  const check = useMemo(() => verifyFactorization(result.matrix, result.Q, result.R), [result]);

  return (
    <div className="results">
      <StatisticsPanel statistics={result.statistics} />

      <section className="card" aria-labelledby="qr-title">
        <div className="card-header">
          <h2 id="qr-title">Factorización A = Q·R</h2>
          <div className="meta">
            {result.createdAt && <span className="badge">Historial · {new Date(result.createdAt).toLocaleString('es')}</span>}
            <span className={result.cached ? 'badge badge-hit' : 'badge'}>{result.cached ? 'Caché Redis: HIT' : 'Calculado: MISS'}</span>
          </div>
        </div>

        <div className="matrices">
          <MatrixTable title="A" description="matriz original" matrix={result.matrix} />
          <MatrixTable title="Q" description="ortogonal (Qᵀ·Q = I)" matrix={result.Q} />
          <MatrixTable title="R" description="triangular superior" matrix={result.R} dimLowerTriangle />
        </div>

        <p className="verification small">
          Verificación en el navegador: máx |Q·R − A| = <code>{formatError(check.reconstructionError)}</code>
          {' · '}máx |Qᵀ·Q − I| = <code>{formatError(check.orthogonalityError)}</code>
        </p>
        {result.requestId && <p className="muted small">ID de la petición: <code>{result.requestId}</code></p>}
      </section>
    </div>
  );
}
