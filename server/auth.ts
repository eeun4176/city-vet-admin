import type { IncomingMessage } from 'node:http';
import { SignJWT, jwtVerify } from 'jose';
import type { GrantPermission } from '../shared/permissions';
import { config } from './config';
import { sql } from './db';
import { AppError, forbidden, unauthenticated } from './errors';
import { isBadgePageRead } from '../shared/navigationBadges';

export const COOKIE = 'ekapon_session';
export type Scope = 'full' | 'reset';
export type AccountType = 'SuperAdmin' | 'Admin' | 'Paravet' | 'User';

export interface Session {
  id: number;
  type: AccountType;
  scope: Scope;
  key: string | null;
  username: string | null;
  name: string;
  barangayId: number | null;
  barangay: string | null;
  locale: 'en' | 'fil';
  /** Active, unexpired grants that apply everywhere (barangay-scoped grants are checked per route). */
  grants: GrantPermission[];
}

const secret = () => new TextEncoder().encode(config().jwtSecret);
const RESET_SECONDS = 600;

export async function sessionCookie(account: { id: number; type: string }, scope: Scope): Promise<string> {
  const cfg = config();
  const ttl = scope === 'full' ? cfg.sessionHours * 3600 : RESET_SECONDS;
  const jwt = await new SignJWT({ typ: account.type, scope })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(account.id))
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secret());
  return `${COOKIE}=${jwt}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ttl}${cfg.isProd ? '; Secure' : ''}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${config().isProd ? '; Secure' : ''}`;

function readCookie(req: IncomingMessage): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

/**
 * Verifies the session cookie AND re-checks the account in the database on every request,
 * so putting an account on hold, disabling, locking or archiving it takes effect immediately.
 * Feature switches are applied from `req.appFeature`, which the dispatcher sets per route.
 */
export async function requireAuth(req: IncomingMessage, opts: { roles?: AccountType[]; scope?: Scope; allowMaintenance?: boolean } = {}): Promise<Session> {
  const token = readCookie(req);
  if (!token) throw unauthenticated();
  let payload;
  try {
    ({ payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] }));
  } catch {
    throw unauthenticated('Your session has expired. Please sign in again.');
  }
  const wantScope = opts.scope ?? 'full';
  if (payload.scope !== wantScope) throw unauthenticated(wantScope === 'full' ? 'Finish creating your new password first.' : 'Please sign in again.');
  const id = Number(payload.sub);
  const [a] = await sql()`
    select a.id, a.account_type::text as type, a.account_key, a.username::text as username,
           a.full_name, a.status::text as status, a.barangay_id, b.name as barangay, a.locale,
           coalesce((select array_agg(distinct g.permission)
                       from ekapon.access_grants g
                      where g.grantee_id = a.id and g.revoked_at is null and g.expires_at > now()
                        and g.barangay_id is null), '{}') as grants
      from ekapon.accounts a
      left join ekapon.barangays b on b.id = a.barangay_id
     where a.id = ${id} and a.archived_at is null`;
  if (a?.status === 'On hold') throw unauthenticated('Your account is on hold. Please contact the City Veterinary Office.');
  const expected = wantScope === 'full' ? 'Active' : 'Password reset required';
  if (!a || a.status !== expected) throw unauthenticated('Your session is no longer valid. Please sign in again.');
  if (a.type === 'User') throw unauthenticated('Resident access has been retired. Contact staff for assistance.');
  if (opts.roles && !opts.roles.includes(a.type)) throw forbidden();
  if (wantScope === 'full' && a.type !== 'SuperAdmin' && !opts.allowMaintenance) {
    const [maintenance] = await sql()`
      select setting_value = 'true'::jsonb as enabled
        from ekapon.system_settings where setting_key = 'maintenance_mode'`;
    if (maintenance?.enabled) {
      throw new AppError(503, 'MAINTENANCE_MODE', 'The dashboard is temporarily under maintenance. Please try again later.');
    }
    const feature = (req as IncomingMessage & { appFeature?: string }).appFeature;
    if (feature) {
      const [access] = await sql()`
        select enabled from ekapon.role_feature_access
         where account_type = ${a.type} and feature_key = ${feature}`;
      if (access && !access.enabled) throw forbidden('This feature is currently disabled for your account type.');
    }
  }
  const session:Session = {
    id: a.id,
    type: a.type,
    scope: wantScope,
    key: a.account_key,
    username: a.username,
    name: a.full_name,
    barangayId: a.barangay_id,
    barangay: a.barangay,
    locale: a.locale,
    grants: a.grants,
  };
  const navNode=req.headers['x-nav-node'];
  if(req.method==='GET'&&wantScope==='full'&&typeof navNode==='string'&&navNode!=='inbox'){
    const url=new URL(req.url??'/','http://local');
    const rewritten=(req as IncomingMessage & {query?:Record<string,unknown>}).query?.route ?? url.searchParams.get('route');
    const path=(typeof rewritten==='string'?rewritten:url.pathname).replace(/^\/api\/v1/,'')+url.search;
    if(isBadgePageRead(navNode,path)){
      const {navigationReadReceipt}=await import('./navigationBadges');
      (req as IncomingMessage & {navReadReceipt?:string|null}).navReadReceipt=await navigationReadReceipt(sql(),session,navNode);
    }
  }
  return session;
}
