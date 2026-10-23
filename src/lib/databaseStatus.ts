export type DatabaseStatus = 'active' | 'loading' | 'error' | 'offline';

/** No network is "offline" whatever the last /health check said; online, the check decides. */
export function databaseStatus(online: boolean, health: 'checking' | 'connected' | 'failed'): DatabaseStatus {
  if (!online) return 'offline';
  return health === 'connected' ? 'active' : health === 'failed' ? 'error' : 'loading';
}
