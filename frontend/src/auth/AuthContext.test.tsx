import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';
import { UNAUTHORIZED_EVENT } from '../lib/api';

// A tiny harness component that surfaces the auth state + actions as DOM.
function Harness() {
  const { user, loading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.email : 'anon'}</span>
      <button onClick={() => void login('a@b.com', 'pw')}>login</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

function resp(body: unknown, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  document.cookie = 'hissa_csrf=csrf-token';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AuthProvider / useAuth', () => {
  it('bootstraps to anonymous when /api/auth/me 401s', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(resp({ detail: 'no session' }, 401));

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'), { timeout: 4000 });
    expect(screen.getByTestId('user')).toHaveTextContent('anon');
  });

  it('login sets the user', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    // Mount bootstrap: 401 -> anonymous.
    fetchMock.mockResolvedValueOnce(resp({ detail: 'no session' }, 401));
    // login POST -> user.
    fetchMock.mockResolvedValueOnce(resp({ user_id: 1, email: 'a@b.com', name: 'A' }));

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'), { timeout: 4000 });

    await userEvent.click(screen.getByRole('button', { name: 'login' }));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('a@b.com'), { timeout: 4000 });
  });

  it('logout clears the user', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(resp({ user_id: 1, email: 'a@b.com' })); // bootstrap me -> logged in
    fetchMock.mockResolvedValueOnce(resp(undefined, 204)); // logout POST

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('a@b.com'), { timeout: 4000 });

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('anon'), { timeout: 4000 });
  });

  it('clears the user when the UNAUTHORIZED_EVENT fires', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(resp({ user_id: 1, email: 'a@b.com' })); // bootstrap -> logged in

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('a@b.com'), { timeout: 4000 });

    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('anon'), { timeout: 4000 });
  });
});
