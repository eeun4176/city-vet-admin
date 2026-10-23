import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { can, type Capability, type GrantPermission, type Principal, type Role } from '../../shared/permissions';
import type { Locale } from '../i18n/messages';
import { api, ApiError } from './api';
import { authTabId, readQueries } from './readQueries';

export interface Account {
  id: number;
  type: Role;
  name: string;
  username: string | null;
  accountKey: string | null;
  barangayId: number | null;
  barangay: string | null;
  locale?: Locale;
  theme?: 'light' | 'dark';
  profilePhoto?: string | null;
  grants?: GrantPermission[];
}

interface Controls { maintenanceMode: boolean; featureAccess: Record<string, boolean> }

interface AuthState {
  status: 'loading' | 'anonymous' | 'maintenance' | 'ready';
  account: Account | null;
  controls: Controls | null;
  principal: Principal | null;
  can: (capability: Capability) => boolean;
  featureEnabled: (feature?: string) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setLocale: (locale: Locale) => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [account, setAccount] = useState<Account | null>(null);
  const [controls, setControls] = useState<Controls | null>(null);
  const authVersion = useRef(0);
  const refreshing = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    if (refreshing.current) return refreshing.current;
    const version = authVersion.current;
    const action = async () => {
    try {
      const me = await api<{ account: Account }>('GET', '/auth/me');
      const info = await api<{ maintenanceMode: boolean; featureAccess: { accountType: string; featureKey: string; enabled: boolean }[] }>('GET', '/admin/controls').catch(() => null);
      if (version !== authVersion.current) return;
      readQueries.setScope(JSON.stringify([me.account.id, me.account.type, me.account.barangayId, [...(me.account.grants ?? [])].sort(), info?.featureAccess.map((item) => `${item.accountType}:${item.featureKey}:${item.enabled}`).sort()]));
      setAccount(me.account);
      document.documentElement.classList.toggle('dark', me.account.theme === 'dark');
      try { localStorage.setItem('cv.theme', me.account.theme === 'dark' ? 'dark' : 'light'); } catch { /* storage unavailable */ }
      document.documentElement.lang = me.account.locale === 'fil' ? 'fil' : 'en';
      setControls(info ? {
        maintenanceMode: info.maintenanceMode,
        featureAccess: Object.fromEntries(info.featureAccess.map((item) => [`${item.accountType}:${item.featureKey}`, item.enabled])),
      } : null);
      setStatus('ready');
    } catch (error) {
      if (version !== authVersion.current) return;
      readQueries.setScope('anonymous');
      setAccount(null);
      setControls(null);
      setStatus(error instanceof ApiError && error.code === 'MAINTENANCE_MODE' ? 'maintenance' : 'anonymous');
    }
    };
    const promise = action().finally(() => { if (refreshing.current === promise) refreshing.current = null; });
    refreshing.current = promise;
    return promise;
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onExpired = () => { authVersion.current++; refreshing.current = null; readQueries.setScope('anonymous'); setAccount(null); setStatus('anonymous'); };
    window.addEventListener('cv:unauthenticated', onExpired);
    return () => window.removeEventListener('cv:unauthenticated', onExpired);
  }, []);
  useEffect(() => {
    const check = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
  }, [refresh]);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('cv-auth-state');
    channel.onmessage = (event) => { if (event.data?.sender === authTabId) return; authVersion.current++; refreshing.current = null; readQueries.invalidate('scope'); setStatus('loading'); void refresh(); };
    return () => channel.close();
  }, [refresh]);

  const principal = useMemo<Principal | null>(
    () => (account ? { role: account.type, grants: account.grants ?? [] } : null), [account]);

  const value = useMemo<AuthState>(() => ({
    status, account, controls, principal,
    can: (capability) => can(principal, capability),
    featureEnabled: (feature) => {
      if (!feature || !account || account.type === 'SuperAdmin') return true;
      return controls?.featureAccess[`${account.type}:${feature}`] !== false;
    },
    refresh,
    logout: async () => {
      authVersion.current++; refreshing.current = null; readQueries.setScope('anonymous');
      await api('POST', '/auth/logout', {}).catch(() => undefined);
      setAccount(null);
      setStatus('anonymous');
    },
    setLocale: (locale) => {
      setAccount((current) => current ? { ...current, locale } : current);
      void api('PUT', '/auth/preferences', { locale }).catch((error: unknown) => {
        window.dispatchEvent(new CustomEvent('cv:api-error', { detail: { message: error instanceof Error ? error.message : 'Could not save language preference.' } }));
      });
    },
  }), [status, account, controls, principal, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
