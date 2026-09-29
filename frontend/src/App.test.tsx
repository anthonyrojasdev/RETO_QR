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

/** Simula Kong: login, factorización e historial. */
function mockGateway({ qrStatus = 200 } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/auth/login')) {
      const { password } = JSON.parse(String(init?.body));
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
    if (url.includes('/api/qr/history')) {
      return json({ items: [] });
    }
    return json({ message: 'no mock' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderApp() {
  return render(<AuthProvider><App /></AuthProvider>);
}

async function loginAsAnalyst(user: ReturnType<typeof userEvent.setup>, password = 'Analyst123!') {
  await user.type(screen.getByLabelText('Usuario'), 'analyst');
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Ingresar' }));
}

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
    expect(screen.getByText('Calculado: MISS')).toBeInTheDocument();
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

    const editor = await screen.findByLabelText(/Una fila por línea/);
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
});
