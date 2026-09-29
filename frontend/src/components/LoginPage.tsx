import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/session';
import { ErrorMessage } from './ErrorMessage';

/** Usuarios de .env.example, para probar rápidamente los dos roles. */
const DEMO_USERS = [
  { username: 'analyst', password: 'Analyst123!', description: 'solo factorización QR' },
  { username: 'admin', password: 'Admin123!', description: 'QR + Stats API directa' },
];

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
      <form className="card login-card" onSubmit={handleSubmit}>
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">QR</span>
          <div>
            <h1>Factorización QR</h1>
            <p className="muted">Go · Node.js · Kong · PostgreSQL · Redis</p>
          </div>
        </div>

        {logoutReason && <div className="alert alert-info" role="status">{logoutReason}</div>}
        <ErrorMessage error={error} />

        <label htmlFor="username">Usuario</label>
        <input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />

        <label htmlFor="password">Contraseña</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? 'Ingresando…' : 'Ingresar'}
        </button>

        <div className="demo-users">
          <p className="muted small">Usuarios de prueba (definidos en <code>.env.example</code>):</p>
          {DEMO_USERS.map((user) => (
            <button
              key={user.username}
              type="button"
              className="chip"
              onClick={() => { setUsername(user.username); setPassword(user.password); }}
            >
              <strong>{user.username}</strong> · {user.description}
            </button>
          ))}
        </div>
      </form>
    </main>
  );
}
