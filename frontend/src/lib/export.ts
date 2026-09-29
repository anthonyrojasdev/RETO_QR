import type { FactorizeResult, Matrix } from '../api/types';

function matrixToCsv(name: string, matrix: Matrix): string {
  return [`${name} (${matrix.length}x${matrix[0].length})`, ...matrix.map((row) => row.join(','))].join('\n');
}

/** CSV con A, Q y R a precisión completa, separadas por una línea en blanco. */
export function resultToCsv(result: Pick<FactorizeResult, 'matrix' | 'Q' | 'R'>): string {
  return [matrixToCsv('A', result.matrix), matrixToCsv('Q', result.Q), matrixToCsv('R', result.R)].join('\n\n') + '\n';
}

/** JSON con la matriz original, Q, R y las estadísticas. */
export function resultToJson(result: FactorizeResult): string {
  const { matrix, Q, R, statistics } = result;
  return JSON.stringify({ A: matrix, Q, R, statistics }, null, 2);
}

/** Descarga un texto como archivo desde el navegador. */
export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

/** "hace 5 minutos", "ayer"… a partir de una fecha ISO. */
export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return 'hace un momento';
}
