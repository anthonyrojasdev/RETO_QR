import { useMemo, type FormEvent } from 'react';
import type { Matrix } from '../api/types';
import { EXAMPLES, matrixToText, parseMatrix } from '../lib/matrix';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (matrix: Matrix) => void;
  loading: boolean;
}

/** Editor de la matriz A: una fila por línea, con validación en vivo y ejemplos. */
export function MatrixEditor({ value, onChange, onSubmit, loading }: Props) {
  const parsed = useMemo(() => parseMatrix(value), [value]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (parsed.ok) onSubmit(parsed.matrix);
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="card-header">
        <h2>Matriz A</h2>
        {parsed.ok && <span className="badge">{parsed.matrix.length}×{parsed.matrix[0].length}</span>}
      </div>

      <label htmlFor="matrix" className="muted small">
        Una fila por línea; números separados por espacios o comas (decimales con punto). También acepta JSON.
      </label>
      <textarea
        id="matrix"
        className="matrix-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        spellCheck={false}
        aria-invalid={!parsed.ok}
        aria-describedby="matrix-status"
      />
      <p id="matrix-status" className={parsed.ok ? 'muted small' : 'field-error small'} aria-live="polite">
        {parsed.ok ? 'Matriz válida.' : parsed.error}
      </p>

      <div className="examples">
        {EXAMPLES.map((example) => (
          <button key={example.label} type="button" className="chip" onClick={() => onChange(matrixToText(example.matrix))}>
            {example.label}
          </button>
        ))}
      </div>

      <button type="submit" className="button-primary" disabled={!parsed.ok || loading}>
        {loading ? 'Calculando…' : 'Calcular factorización QR'}
      </button>
    </form>
  );
}
