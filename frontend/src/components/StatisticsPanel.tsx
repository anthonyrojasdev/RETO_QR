import type { Statistics } from '../api/types';
import { formatNumber } from '../lib/matrix';

/** Estadísticas calculadas por la Stats API (Node.js) sobre Q y R. */
export function StatisticsPanel({ statistics }: { statistics: Statistics }) {
  const cards = [
    { label: 'Valor máximo', value: formatNumber(statistics.max) },
    { label: 'Valor mínimo', value: formatNumber(statistics.min) },
    { label: 'Promedio', value: formatNumber(statistics.average) },
    { label: 'Suma total', value: formatNumber(statistics.sum) },
  ];

  return (
    <section className="card" aria-labelledby="stats-title">
      <div className="card-header">
        <h2 id="stats-title">Estadísticas de Q y R</h2>
        <span className="muted small">{statistics.count} valores · Stats API (Node.js)</span>
      </div>

      <dl className="stats-grid">
        {cards.map((card) => (
          <div key={card.label} className="stat">
            <dt>{card.label}</dt>
            <dd>{card.value}</dd>
          </div>
        ))}
      </dl>

      <div className="diagonal">
        <p>
          ¿Alguna matriz es diagonal?{' '}
          <strong className={statistics.isAnyDiagonal ? 'yes' : 'no'}>{statistics.isAnyDiagonal ? 'Sí' : 'No'}</strong>
        </p>
        <ul>
          {Object.entries(statistics.matrices).map(([name, summary]) => (
            <li key={name} className={summary.isDiagonal ? 'tag tag-yes' : 'tag'}>
              {name} ({summary.rows}×{summary.columns}): {summary.isDiagonal ? 'diagonal' : 'no diagonal'}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
