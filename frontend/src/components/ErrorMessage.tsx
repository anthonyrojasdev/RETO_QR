import { ApiError } from '../api/client';

interface Props {
  error: unknown;
}

/** Muestra un error de la API con su detalle y el X-Request-ID para soporte. */
export function ErrorMessage({ error }: Props) {
  if (!error) return null;
  const apiError = error instanceof ApiError ? error : null;
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="alert alert-error" role="alert">
      <p>{message}</p>
      {apiError && apiError.details.length > 0 && (
        <ul>
          {apiError.details.map((detail) => <li key={detail}>{detail}</li>)}
        </ul>
      )}
      {apiError?.requestId && <p className="note">ID de la petición: <code>{apiError.requestId}</code></p>}
    </div>
  );
}
