import type { Matrix } from '../api/types';
import { formatNumber } from '../lib/matrix';

interface Props {
  title: string;
  description: string;
  matrix: Matrix;
  /** Atenúa los ceros bajo la diagonal (útil para R, triangular superior). */
  dimLowerTriangle?: boolean;
}

/** Muestra una matriz con sus dimensiones y la diagonal principal resaltada. */
export function MatrixTable({ title, description, matrix, dimLowerTriangle = false }: Props) {
  return (
    <figure className="matrix">
      <figcaption>
        <strong>{title}</strong> <span className="badge">{matrix.length}×{matrix[0].length}</span>
        <span className="muted small"> {description}</span>
      </figcaption>
      <div className="matrix-scroll">
        <table>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                {row.map((value, j) => {
                  const classes = [i === j && 'diagonal', dimLowerTriangle && i > j && 'dimmed'].filter(Boolean).join(' ');
                  return <td key={j} className={classes || undefined} title={String(value)}>{formatNumber(value)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
