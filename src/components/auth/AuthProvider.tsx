import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Identity } from '@/lib/auth-types';

type Session = { identity: Identity | null; status: 'loading' | 'ready' | 'error'; notice: string };
type Auth = Session & { login: (email: string, password: string) => Promise<Identity>; logout: () => Promise<void>; refresh: () => Promise<void> };
const Context = createContext<Auth | null>(null);

async function request(path: string, body?: object) {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${path}`, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json', 'X-Isave-Request': '1' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new Error('Unable to reach i-Save. Please try again.'); }
  return response;
}

async function failure(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return new Error(typeof body.error === 'string' ? body.error : 'This request could not be completed. Please try again.');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ identity: null, status: 'loading', notice: '' });
  const identity = useRef<Identity | null>(null);
  const version = useRef(0);
  const mutation = useRef(false);
  const refresh = useCallback(async () => {
    if (mutation.current) return;
    const current = ++version.current;
    try {
      const response = await request('me');
      if (response.status === 401) {
        if (current !== version.current) return;
        const expired = !!identity.current;
        identity.current = null;
        setSession(s => ({ identity: null, status: 'ready', notice: expired ? 'Your session has expired. Please log in again.' : s.notice }));
        return;
      }
      if (!response.ok) throw await failure(response);
      const data = await response.json() as Identity;
      if (current !== version.current) return;
      identity.current = data;
      setSession({ identity: data, status: 'ready', notice: '' });
    } catch {
      if (current === version.current) setSession({ identity: null, status: 'error', notice: 'Unable to verify your session. Please try again.' });
    }
  }, []);
  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    window.addEventListener('pageshow', focus);
    return () => { clearInterval(interval); window.removeEventListener('focus', focus); window.removeEventListener('pageshow', focus); version.current++; };
  }, [refresh]);

  const login = async (email: string, password: string) => {
    mutation.current = true;
    ++version.current;
    try {
      const response = await request('login', { email, password });
      if (!response.ok) throw await failure(response);
      const me = await request('me');
      if (!me.ok) throw await failure(me);
      const data = await me.json() as Identity;
      identity.current = data;
      setSession({ identity: data, status: 'ready', notice: '' });
      return data;
    } finally { mutation.current = false; }
  };
  const logout = async () => {
    mutation.current = true;
    ++version.current;
    try {
      const response = await request('logout', {});
      if (!response.ok) throw new Error('Could not sign out. Your session may still be active. Please try again.');
      identity.current = null;
      setSession({ identity: null, status: 'ready', notice: '' });
    } finally { mutation.current = false; }
  };
  return <Context.Provider value={{ ...session, refresh, login, logout }}>{children}</Context.Provider>;
}

export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}
