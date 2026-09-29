/** Matriz representada fila a fila. */
export type Matrix = number[][];

export type Role = 'admin' | 'analyst';

/** Resumen de una matriz calculado por la Stats API. */
export interface MatrixSummary {
  rows: number;
  columns: number;
  isDiagonal: boolean;
}

/** Estadísticas de Q y R (Stats API en Node.js). */
export interface Statistics {
  max: number;
  min: number;
  average: number;
  sum: number;
  count: number;
  isAnyDiagonal: boolean;
  matrices: Record<string, MatrixSummary>;
}

/** Respuesta de POST /api/qr (QR API en Go). */
export interface FactorizeResponse {
  Q: Matrix;
  R: Matrix;
  statistics: Statistics;
}

/** Resultado mostrado en pantalla: la respuesta más la matriz original y metadatos. */
export interface FactorizeResult extends FactorizeResponse {
  matrix: Matrix;
  /** true si la respuesta salió del caché de Redis (X-Cache: HIT). */
  cached: boolean;
  /** X-Request-ID para buscar la petición en los logs de Kong y de los servicios. */
  requestId: string | null;
  /** Fecha del cálculo cuando viene del historial. */
  createdAt?: string;
}

/** Elemento de GET /api/qr/history. */
export interface HistoryEntry extends FactorizeResponse {
  id: number;
  /** Autor del cálculo; solo viene en el historial de todos (scope=all, admin). */
  username?: string;
  createdAt: string;
  rows: number;
  columns: number;
  matrix: Matrix;
  cached: boolean;
}

/** Actividad de un usuario (GET /api/qr/usage, solo admin). */
export interface UserUsage {
  username: string;
  count: number;
  cacheHits: number;
  lastAt: string;
}

/** Resumen de uso del servicio (GET /api/qr/usage, solo admin). */
export interface Usage {
  total: number;
  cacheHits: number;
  users: UserUsage[];
}

/** Respuesta de POST /api/auth/login. */
export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: { username: string; role: Role };
}

/** Sesión guardada en el navegador. */
export interface Session {
  token: string;
  username: string;
  role: Role;
  /** Momento de expiración del token (epoch en ms). */
  expiresAt: number;
}
