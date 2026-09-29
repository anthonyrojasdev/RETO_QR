/** URL pública de Kong. El frontend solo habla con el gateway, nunca con los servicios. */
const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

/** Error de una llamada a la API, con un mensaje listo para mostrar. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];
  readonly requestId: string | null;

  constructor(status: number, code: string, message: string, details: string[] = [], requestId: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export interface ApiResponse<T> {
  data: T;
  headers: Headers;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string;
}

/** Hace una petición JSON a Kong y convierte los errores en ApiError. */
export async function request<T>(path: string, { method = 'GET', body, token }: RequestOptions = {}): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Verifica que el gateway (Kong) esté en ejecución.');
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw toApiError(response.status, payload, response.headers.get('X-Request-ID'));
  }
  return { data: payload as T, headers: response.headers };
}

/** Mensajes para los errores que responde Kong, que solo traen { "message": "..." }. */
const GATEWAY_MESSAGES: Record<number, string> = {
  401: 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.',
  403: 'Tu rol no tiene permiso para esta operación.',
  413: 'La matriz es demasiado grande para enviarla.',
  429: 'Demasiadas peticiones seguidas. Espera un momento e inténtalo de nuevo.',
};

function toApiError(status: number, payload: unknown, requestId: string | null): ApiError {
  // Formato de los servicios: { "error": { code, message, details?, requestId } }
  if (isRecord(payload) && isRecord(payload.error)) {
    const { code, message, details } = payload.error;
    return new ApiError(
      status,
      typeof code === 'string' ? code : 'ERROR',
      typeof message === 'string' ? capitalize(message) : 'Ocurrió un error inesperado.',
      Array.isArray(details) ? details.filter((d): d is string => typeof d === 'string') : [],
      requestId,
    );
  }
  // Formato de Kong: { "message": "Unauthorized" }
  const message = GATEWAY_MESSAGES[status] ?? (status >= 500
    ? 'El servicio no está disponible en este momento. Inténtalo de nuevo.'
    : 'La petición no se pudo completar.');
  return new ApiError(status, `HTTP_${status}`, message, [], requestId);
}

/** Los mensajes de Go siguen su convención (minúscula inicial); en pantalla van con mayúscula. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
