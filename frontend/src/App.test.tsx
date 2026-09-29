import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';

const s = 1 / Math.sqrt(17);
const qrResponse = {
  Q: [[s, 4 * s], [4 * s, -s]],
  R: [[17 * s, 22 * s, 27 * s], [0, 3 * s, 6 * s]],
  statistics: {
    max: 27 * s, min: -s, average: 8.3 * s, sum: 83 * s, count: 10, isAnyDiagonal: false,
    matrices: { Q: { rows: 2, columns: 2, isDiagonal: false }, R: { rows: 2, columns: 3, isDiagonal: false } },
  },
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

const historyEntry = {
  id: 7, username: 'analyst', createdAt: '2026-09-29T10:00:00Z', rows: 2, columns: 3,
  matrix: [[1, 2, 3], [4, 5, 6]], cached: true, ...qrResponse,
};

/** Simula Kong: login, factorización, historial y rutas de admin. */
function mockGateway({ qrStatus = 200 } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/auth/login')) {
      const { username, password } = JSON.parse(String(init?.body));
      if (username === 'admin' && password === 'Admin123!') {
        return json({ accessToken: 'token-admin', tokenType: 'Bearer', expiresIn: 3600, user: { username: 'admin', role: 'admin' } });
      }
      return password === 'Analyst123!'
        ? json({ accessToken: 'token-analyst', tokenType: 'Bearer', expiresIn: 3600, user: { username: 'analyst', role: 'analyst' } })
        : json({ error: { code: 'INVALID_CREDENTIALS', message: 'Usuario o contraseña incorrectos' } }, 401);
    }
    if (url.endsWith('/api/qr') && qrStatus === 200) {
      return json(qrResponse, 200, { 'X-Cache': 'MISS', 'X-Request-ID': 'req-42' });
    }
    if (url.endsWith('/api/qr')) {
      return json({ message: 'Unauthorized' }, qrStatus);
    }
    if (url.includes('/api/qr/history') && url.includes('user=analyst')) {
      return json({ items: [{ ...historyEntry, id: 8, cached: false }] });
    }
    if (url.includes('/api/qr/history') && url.includes('scope=all')) {
      return json({ items: [historyEntry] });
    }
    if (url.includes('/api/qr/history')) {
      return json({ items: [] });
    }
    if (url.endsWith('/api/qr/usage')) {
      return json({ total: 4, cacheHits: 1, users: [{ username: 'analyst', count: 4, cacheHits: 1, lastAt: '2026-09-29T10:00:00Z' }] });
    }
    if (url.endsWith('/api/statistics')) {
      return json({ ...qrResponse.statistics, max: 3, count: 8, isAnyDiagonal: true });
    }
    return json({ message: 'no mock' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderApp() {
  return render(<AuthProvider><App /></AuthProvider>);
}

async function loginAs(user: ReturnType<typeof userEvent.setup>, username: string, password: string) {
  await user.type(screen.getByLabelText('Usuario'), username);
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Ingresar' }));
}

const loginAsAnalyst = (user: ReturnType<typeof userEvent.setup>, password = 'Analyst123!') => loginAs(user, 'analyst', password);

describe('App', () => {
  it('inicia sesión, calcula la factorización y muestra las estadísticas', async () => {
    const fetchMock = mockGateway();
    const user = userEvent.setup();
    renderApp();

    await loginAsAnalyst(user);
    expect(await screen.findByText('analyst')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Calcular factorización QR' }));

    const stats = await screen.findByRole('region', { name: 'Estadísticas de Q y R' });
    expect(within(stats).getByText('Valor máximo').nextSibling).toHaveTextContent('6.5485');
    expect(within(stats).getByText('Valor mínimo').nextSibling).toHaveTextContent('-0.2425');
    expect(within(stats).getByText('Suma total').nextSibling).toHaveTextContent('20.1305');
    expect(within(stats).getByText('No')).toBeInTheDocument();
    expect(screen.getByText('Calculado')).toBeInTheDocument();
    expect(screen.getByText('req-42')).toBeInTheDocument();

    const qrCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/api/qr'));
    expect(qrCall?.[1]?.headers).toMatchObject({ Authorization: 'Bearer token-analyst' });
    expect(qrCall?.[1]?.body).toBe(JSON.stringify({ matrix: [[1, 2, 3], [4, 5, 6]] }));
  });

  it('muestra el error del login', async () => {
    mockGateway();
    const user = userEvent.setup();
    renderApp();

    await loginAsAnalyst(user, 'incorrecta');

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos');
  });

  it('valida la matriz antes de enviarla', async () => {
    mockGateway();
    const user = userEvent.setup();
    renderApp();
    await loginAsAnalyst(user);

    const editor = await screen.findByLabelText('Matriz A');
    await user.clear(editor);
    await user.type(editor, '1 2{enter}3');

    expect(screen.getByText(/debe ser rectangular/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calcular factorización QR' })).toBeDisabled();
  });

  it('cierra la sesión si Kong rechaza el token', async () => {
    mockGateway({ qrStatus: 401 });
    const user = userEvent.setup();
    renderApp();
    await loginAsAnalyst(user);

    await user.click(await screen.findByRole('button', { name: 'Calcular factorización QR' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent(/sesión expiró o no es válida/);
  });

  it('analyst no ve las secciones de administrador', async () => {
    mockGateway();
    const user = userEvent.setup();
    renderApp();
    await loginAsAnalyst(user);

    expect(await screen.findByLabelText('Matriz A')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Secciones' })).not.toBeInTheDocument();
  });

  it('calcula con Ctrl+Enter desde el editor', async () => {
    const fetchMock = mockGateway();
    const user = userEvent.setup();
    renderApp();
    await loginAsAnalyst(user);

    await user.click(await screen.findByLabelText('Matriz A'));
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(await screen.findByRole('region', { name: 'Estadísticas de Q y R' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/api/qr'))).toBe(true);
  });

  it('admin ve la actividad del equipo y puede abrir un cálculo de otro usuario', async () => {
    const fetchMock = mockGateway();
    const user = userEvent.setup();
    renderApp();
    await loginAs(user, 'admin', 'Admin123!');

    await user.click(await screen.findByRole('button', { name: 'Actividad del equipo' }));

    const usage = await screen.findByRole('region', { name: 'Resumen de uso' });
    expect(within(usage).getByText('Factorizaciones').nextSibling).toHaveTextContent('4');
    expect(within(usage).getByText('Servidas desde caché').nextSibling).toHaveTextContent(/^25\s%$/);
    expect(fetchMock.mock.calls.some(([url]) => url.includes('scope=all'))).toBe(true);

    const recent = screen.getByRole('region', { name: 'Cálculos recientes del equipo' });
    expect(within(recent).getByText('analyst')).toBeInTheDocument();
    await user.click(within(recent).getByRole('button', { name: 'Abrir' }));

    expect(await screen.findByText('Desde caché (Redis)')).toBeInTheDocument();
    expect(screen.getByLabelText('Matriz A')).toHaveValue('1 2 3\n4 5 6');
  });

  it('admin consulta la Stats API directamente', async () => {
    const fetchMock = mockGateway();
    const user = userEvent.setup();
    renderApp();
    await loginAs(user, 'admin', 'Admin123!');

    await user.click(await screen.findByRole('button', { name: 'Stats API' }));
    await user.click(screen.getByRole('button', { name: 'Calcular estadísticas' }));

    const panel = await screen.findByRole('region', { name: 'Respuesta de la Stats API' });
    expect(within(panel).getByText('Valor máximo').nextSibling).toHaveTextContent('3.0000');
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/api/statistics'));
    expect(call?.[1]?.headers).toMatchObject({ Authorization: 'Bearer token-admin' });
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ Q: [[1, 0], [0, 1]], R: [[2, 1], [0, 3]] });
  });

  it('admin cambia el historial al de todo el equipo o al de un usuario; analyst no puede', async () => {
    const fetchMock = mockGateway();
    const user = userEvent.setup();
    renderApp();
    await loginAs(user, 'admin', 'Admin123!');

    const history = await screen.findByRole('region', { name: 'Historial' });
    const select = within(history).getByLabelText('Historial de');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'analyst' })).toBeInTheDocument());

    await user.selectOptions(select, 'Todo el equipo');
    expect(await within(history).findByText('analyst', { selector: '.author' })).toBeInTheDocument();

    await user.selectOptions(select, 'analyst');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('user=analyst'))).toBe(true));
    await user.click(await within(history).findByTitle('Volver a abrir este cálculo'));
    expect(await screen.findByText('Calculado')).toBeInTheDocument();
    expect(screen.getByLabelText('Matriz A')).toHaveValue('1 2 3\n4 5 6');
  });

  it('analyst ve solo su historial, sin selector', async () => {
    mockGateway();
    const user = userEvent.setup();
    renderApp();
    await loginAsAnalyst(user);

    const history = await screen.findByRole('region', { name: 'Tu historial' });
    expect(within(history).queryByLabelText('Historial de')).not.toBeInTheDocument();
  });
});
