import { useMemo, useState } from 'react';
import type { FactorizeResult } from '../api/types';
import { downloadText, resultToCsv, resultToJson } from '../lib/export';
import { formatError, verifyFactorization } from '../lib/matrix';
import { MatrixTable } from './MatrixTable';
import { StatisticsPanel } from './StatisticsPanel';

const PRECISIONS = [2, 4, 6, 8];

/** Resultado completo: estadísticas, A, Q, R, la verificación A ≈ Q·R y exportación. */
export function ResultView({ result }: { result: FactorizeResult }) {
  const check = useMemo(() => verifyFactorization(result.matrix, result.Q, result.R), [result]);
  const [decimals, setDecimals] = useState(4);
  const [copied, setCopied] = useState(false);

  const size = `${result.matrix.length}x${result.matrix[0].length}`;

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(resultToJson(result));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      downloadText(`qr-${size}.json`, resultToJson(result), 'application/json');
    }
  }

  return (
    <div className="results">
      <div className="result-bar">
        <p className="result-meta">
          <span className={result.cached ? 'status status-cache' : 'status'}>
            {result.cached ? 'Desde caché (Redis)' : 'Calculado'}
          </span>
          {result.createdAt && <span className="dim">{new Date(result.createdAt).toLocaleString('es')}</span>}
          {result.requestId && <span className="dim mono" title="X-Request-ID, para buscar la petición en los logs">{result.requestId}</span>}
        </p>
        <div className="result-actions">
          <label className="field inline">
            <span>Decimales</span>
            <select value={decimals} onChange={(e) => setDecimals(Number(e.target.value))}>
              {PRECISIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <button type="button" className="button-quiet" onClick={copyJson}>{copied ? 'Copiado' : 'Copiar JSON'}</button>
          <button type="button" className="button-quiet" onClick={() => downloadText(`qr-${size}.csv`, resultToCsv(result), 'text/csv')}>
            Descargar CSV
          </button>
        </div>
      </div>

      <StatisticsPanel statistics={result.statistics} decimals={decimals} />

      <section className="panel" aria-label="Factorización A = Q·R">
        <div className="panel-head">
          <h2 className="eyebrow">Factorización A = Q·R</h2>
        </div>
        <div className="matrices">
          <MatrixTable name="A" description="original" matrix={result.matrix} decimals={decimals} />
          <MatrixTable name="Q" description="ortogonal" matrix={result.Q} decimals={decimals} />
          <MatrixTable name="R" description="triangular superior" matrix={result.R} decimals={decimals} dimLowerTriangle />
        </div>
        <p className="note">
          Comprobado en el navegador: máx |Q·R − A| = <code>{formatError(check.reconstructionError)}</code>
          {' · '}máx |QᵀQ − I| = <code>{formatError(check.orthogonalityError)}</code>
        </p>
      </section>
    </div>
  );
}
