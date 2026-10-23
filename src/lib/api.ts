import { authTabId, isAbort, readQueries, summaryLifetime } from './readQueries';
import { badgeNodeForPage,isBadgePageRead } from '../../shared/navigationBadges';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

const AUTH_PATHS = /^\/auth\/(login|first-signin|set-password|me)/;

export async function api<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown, options: { signal?: AbortSignal; fresh?: boolean; readOnly?: boolean;quiet?:boolean; onUpdatedAt?: (value: number) => void } = {}): Promise<T> {
  const trackMutation = method !== 'GET' && !options.readOnly && !/^\/auth\/(login|first-signin|set-password|me|logout)/.test(path);
  if (trackMutation) window.dispatchEvent(new CustomEvent('cv:api-request-start'));
  let response: Response;
  const pagePath=window.location.pathname,navNode=badgeNodeForPage(pagePath);
  const navRead=method==='GET'&&navNode&&navNode!=='inbox'&&isBadgePageRead(navNode,path);
  try {
    const url = new URL(`/api/v1${path}`, window.location.origin);
    if (method === 'GET' && options.fresh && summaryLifetime(path)) url.searchParams.set('fresh', '1');
    response = await fetch(`${url.pathname}${url.search}`, {
      method,
      credentials: 'same-origin',
      headers: {...(body===undefined?{}:{'Content-Type':'application/json'}),...(navRead?{'X-Nav-Node':navNode}:{})},
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: method === 'GET' ? options.signal : undefined,
    });
  } catch (failure) {
    if (isAbort(failure)) throw failure;
    const error = new ApiError(0, 'NETWORK_ERROR', 'The server could not be reached. Check your connection and try again.');
    if (method !== 'GET'&&!options.quiet) window.dispatchEvent(new CustomEvent('cv:api-error', { detail: { message: error.message, code: error.code, status: error.status } }));
    if (trackMutation) window.dispatchEvent(new CustomEvent('cv:api-request-end'));
    throw error;
  }
  let data: any = null;
  try { data = await response.json(); } catch { /* empty body */ }
  if (!response.ok) {
    const error = new ApiError(response.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'The request failed.', data?.error?.details);
    if (response.status === 401 && !AUTH_PATHS.test(path)) { readQueries.invalidate('scope'); window.dispatchEvent(new Event('cv:unauthenticated')); }
    if (method !== 'GET'&&!options.quiet) window.dispatchEvent(new CustomEvent('cv:api-error', { detail: { message: error.message, code: error.code, status: error.status } }));
    if (trackMutation) window.dispatchEvent(new CustomEvent('cv:api-request-end'));
    throw error;
  }
  const ageHeader = response.headers.get('X-Data-Age-Ms');
  const age = ageHeader !== null && /^\d+$/.test(ageHeader) ? Number(ageHeader) : 0;
  options.onUpdatedAt?.(Date.now() - Math.min(age, 60000));
  const receipt=response.headers.get('X-Nav-Receipt');
  if(navRead&&receipt&&!options.signal?.aborted)window.dispatchEvent(new CustomEvent('cv:nav-read',{detail:{node:navNode,token:receipt,pagePath}}));
  if (method !== 'GET' && !options.readOnly) readQueries.invalidate(/^\/auth\/(login|logout|first-signin|set-password)/.test(path) ? 'scope' : 'write');
  if (method !== 'GET' && /^\/auth\/(login|logout|set-password)/.test(path) && typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('cv-auth-state'); channel.postMessage({ sender: authTabId }); channel.close();
  }
  if (trackMutation) {
    const resource = path.split('?')[0].split('/').filter(Boolean).slice(-1)[0]?.replaceAll('-', ' ') ?? 'record';
    const action = method === 'POST' ? 'Saved' : method === 'PATCH' ? 'Updated' : method === 'DELETE' ? 'Removed' : 'Updated';
    window.dispatchEvent(new CustomEvent('cv:api-success', { detail: { message: `${action} successfully · ${resource}`, undoToken: (data as { undoToken?: string } | null)?.undoToken,undoLabel:(data as {undoLabel?:string}|null)?.undoLabel } }));
    window.dispatchEvent(new CustomEvent('cv:api-request-end'));
  }
  return data as T;
}
