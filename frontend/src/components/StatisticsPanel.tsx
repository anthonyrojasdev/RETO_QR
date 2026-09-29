import type { Statistics } from '../api/types';
import { formatNumber } from '../lib/matrix';

interface Props {
  statistics: Statistics;
  decimals?: number;
  title?: string;
  source?: string;
}

/** Estadísticas calculadas por la Stats API (Node.js) sobre Q y R. */
export function StatisticsPanel({ statistics, decimals = 4, title = 'Estadísticas de Q y R', source = 'Stats API · Node.js' }: Props) {
  const figures = [
    { label: 'Valor máximo', value: statistics.max },
    { label: 'Valor mínimo', value: statistics.min },
    { label: 'Promedio', value: statistics.average },
    { label: 'Suma total', value: statistics.sum },
  ];
  const diagonal = Object.entries(statistics.matrices);

  return (
    <section className="panel" aria-label={title}>
      <div className="panel-head">
        <h2 className="eyebrow">{title}</h2>
        <span className="dim">{statistics.count} valores · {source}</span>
      </div>

      <dl className="figures">
        {figures.map((figure) => (
          <div key={figure.label}>
            <dt>{figure.label}</dt>
            <dd>{formatNumber(figure.value, decimals)}</dd>
          </div>
        ))}
      </dl>

      <p className="diagonal-line">
        ¿Alguna matriz es diagonal? <strong className={statistics.isAnyDiagonal ? 'ok' : undefined}>{statistics.isAnyDiagonal ? 'Sí' : 'No'}</strong>
        {diagonal.map(([name, summary]) => (
          <span key={name} className="dim">
            {' · '}{name} {summary.rows}×{summary.columns} {summary.isDiagonal ? 'es diagonal' : 'no es diagonal'}
          </span>
        ))}
      </p>
    </section>
  );
}
