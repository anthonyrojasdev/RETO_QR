import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/session';
import { ErrorMessage } from './ErrorMessage';

/** Usuarios de .env.example. Solo se ofrecen en desarrollo: en producción las claves son otras. */
const DEMO_USERS = import.meta.env.DEV
  ? [
    { username: 'analyst', password: 'Analyst123!', description: 'factoriza y ve su historial' },
    { username: 'admin', password: 'Admin123!', description: 'además, actividad del equipo y Stats API' },
  ]
  : [];

export function LoginPage() {
  const { login, logoutReason } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  return (
    <main className="login">
      <div className="login-intro">
        <p className="mono login-formula">A = Q·R</p>
        <p>Factoriza matrices rectangulares y revisa las estadísticas de Q y R.</p>
        <p className="dim">Go calcula la factorización, Node.js las estadísticas y Kong protege el acceso.</p>
      </div>

      <form className="login-form" onSubmit={handleSubmit}>
        <h1>Iniciar sesión</h1>
        {logoutReason && <p className="alert alert-info" role="status">{logoutReason}</p>}
        <ErrorMessage error={error} />

        <label className="field">
          <span>Usuario</span>
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? 'Ingresando…' : 'Ingresar'}
        </button>

        {DEMO_USERS.length > 0 && (
          <div className="demo-users">
            <p className="note">Usuarios de desarrollo (<code>.env.example</code>):</p>
            {DEMO_USERS.map((user) => (
              <button
                key={user.username}
                type="button"
                className="button-link"
                onClick={() => { setUsername(user.username); setPassword(user.password); }}
              >
                {user.username} <span className="dim">— {user.description}</span>
              </button>
            ))}
          </div>
        )}
      </form>
    </main>
  );
}
