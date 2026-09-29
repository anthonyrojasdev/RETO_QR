import { useAuth } from './auth/session';
import { Dashboard } from './components/Dashboard';
import { LoginPage } from './components/LoginPage';

export function App() {
  const { session } = useAuth();
  return session ? <Dashboard session={session} /> : <LoginPage />;
}
