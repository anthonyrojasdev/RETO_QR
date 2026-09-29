import type { Matrix } from '../api/types';
import { formatNumber } from '../lib/matrix';

interface Props {
  name: string;
  description: string;
  matrix: Matrix;
  decimals: number;
  /** Atenúa los ceros bajo la diagonal (útil para R, triangular superior). */
  dimLowerTriangle?: boolean;
}

/** Matriz entre corchetes, con la diagonal principal marcada y el valor exacto al pasar el cursor. */
export function MatrixTable({ name, description, matrix, decimals, dimLowerTriangle = false }: Props) {
  return (
    <figure className="matrix">
      <figcaption>
        <span className="matrix-name">{name}</span>
        <span className="dim mono">{matrix.length}×{matrix[0].length}</span>
        <span className="dim">{description}</span>
      </figcaption>
      <div className="matrix-scroll">
        <div className="bracket">
        <table>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                {row.map((value, j) => {
                  const classes = [i === j && 'diagonal', dimLowerTriangle && i > j && 'dimmed'].filter(Boolean).join(' ');
                  return <td key={j} className={classes || undefined} title={String(value)}>{formatNumber(value, decimals)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </figure>
  );
}
