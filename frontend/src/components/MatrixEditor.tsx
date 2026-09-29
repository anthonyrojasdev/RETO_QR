import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Matrix } from '../api/types';
import { EXAMPLES, MAX_DIMENSION, matrixToText, parseMatrix, randomMatrix } from '../lib/matrix';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (matrix: Matrix) => void;
  loading: boolean;
}

/** Editor de la matriz A: validación en vivo, ejemplos, matriz aleatoria y Ctrl+Enter para calcular. */
export function MatrixEditor({ value, onChange, onSubmit, loading }: Props) {
  const parsed = useMemo(() => parseMatrix(value), [value]);
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);

  function submit() {
    if (parsed.ok && !loading) onSubmit(parsed.matrix);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  }

  const clamp = (n: number) => Math.min(MAX_DIMENSION, Math.max(1, Math.trunc(n) || 1));

  return (
    <form className="panel editor" onSubmit={handleSubmit}>
      <div className="panel-head">
        <label htmlFor="matrix" className="eyebrow">Matriz A</label>
        <span className="dim mono">{parsed.ok ? `${parsed.matrix.length} × ${parsed.matrix[0].length}` : '—'}</span>
      </div>

      <textarea
        id="matrix"
        className="matrix-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={7}
        spellCheck={false}
        aria-invalid={!parsed.ok}
        aria-describedby="matrix-status matrix-help"
      />
      <p id="matrix-status" className={parsed.ok ? 'note' : 'note note-error'} aria-live="polite">
        {parsed.ok ? 'Lista para calcular.' : parsed.error}
      </p>
      <p id="matrix-help" className="note">
        Una fila por línea, valores separados por espacios o comas. También acepta JSON.
      </p>

      <div className="editor-tools">
        <label className="tool-row">
          <span>Ejemplo</span>
          <select
            value=""
            onChange={(e) => {
              const example = EXAMPLES[Number(e.target.value)];
              if (example) onChange(matrixToText(example.matrix));
            }}
          >
            <option value="" disabled>Elegir…</option>
            {EXAMPLES.map((example, i) => <option key={example.label} value={i}>{example.label}</option>)}
          </select>
        </label>

        <div className="tool-row" role="group" aria-labelledby="random-label">
          <span id="random-label">Aleatoria</span>
          <span className="random">
            <input type="number" min={1} max={MAX_DIMENSION} value={rows} aria-label="Filas" onChange={(e) => setRows(clamp(Number(e.target.value)))} />
            <span aria-hidden="true">×</span>
            <input type="number" min={1} max={MAX_DIMENSION} value={columns} aria-label="Columnas" onChange={(e) => setColumns(clamp(Number(e.target.value)))} />
            <button type="button" className="button-quiet" onClick={() => onChange(matrixToText(randomMatrix(rows, columns)))}>
              Generar
            </button>
          </span>
        </div>
      </div>

      <button type="submit" className="button-primary" disabled={!parsed.ok || loading}>
        {loading ? 'Calculando…' : 'Calcular factorización QR'}
        <kbd aria-hidden="true">Ctrl ↵</kbd>
      </button>
    </form>
  );
}
