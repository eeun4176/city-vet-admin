import { z } from 'zod';
import { route, ok, created, parse } from '../../../server/http';
import { sql, tx } from '../../../server/db';
import { requireAuth } from '../../../server/auth';
import { listQuery, likePattern } from '../../../server/listing';
import { ACCOUNT_BASE, toAccount, findAccount, type AccountRow } from '../../../server/accountsView';
import { createAccount } from '../../../server/accountSchemas';
import { unprocessable } from '../../../server/errors';
import { createPortalAccount } from '../../../server/createPortalAccount';

const SORTS: Record<string, string> = { name: 'last_name', key: 'account_key', type: 'account_type', barangay: 'barangay', status: 'status', created: 'created_at' };
const query = listQuery.extend({
  type: z.enum(['SuperAdmin', 'Admin', 'Paravet']).optional(),
  barangay: z.string().trim().max(60).optional(),
  status: z.string().trim().max(40).optional(),
});

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const f = parse(query, c.query);
    if (f.sort && !SORTS[f.sort]) throw unprocessable('INVALID_SORT', `sort must be one of: ${Object.keys(SORTS).join(', ')}`);
    const where: string[] = ['x.archived = $1', "x.account_type <> 'User'"];
    const args: unknown[] = [f.archived];
    const add = (cond: string, ...vals: unknown[]) => { let i = args.length; where.push(cond.replace(/\?/g, () => `$${++i}`)); args.push(...vals); };
    if (session.type === 'Admin') where.push("x.account_type = 'Paravet'");
    if (f.type) add('x.account_type = ?', f.type);
    if (f.barangay) add('lower(x.barangay) = lower(?)', f.barangay);
    if (f.status) add('x.status = ?', f.status);
    if (f.year) add(`extract(year from x.created_at at time zone 'Asia/Manila') = ?`, f.year);
    if (f.month) add(`extract(month from x.created_at at time zone 'Asia/Manila') = ?`, f.month);
    if (f.q) {
      if (session.type === 'SuperAdmin') add(`(x.full_name ilike ? or x.account_key ilike ? or x.mobile ilike ? or x.username ilike ?)`, likePattern(f.q), likePattern(f.q), likePattern(f.q), likePattern(f.q));
      else add(`(x.full_name ilike ? or x.mobile ilike ?)`, likePattern(f.q), likePattern(f.q));
    }
    const order = `${SORTS[f.sort ?? 'created'] ?? 'created_at'} ${f.dir === 'asc' ? 'asc' : 'desc'}, x.id`;
    const base = `from (${ACCOUNT_BASE}) x where ${where.join(' and ')}`;
    const [{ total }] = await sql().unsafe(`select count(*)::int as total ${base}`, args as never[]);
    const rows = await sql().unsafe(`select x.* ${base} order by x.${order} limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`, args as never[]);
    return ok({ data: (rows as unknown as AccountRow[]).map((row) => {
      const account = toAccount(row);
      return session.type === 'SuperAdmin' ? account : { ...account, accountKey: null };
    }), page: f.page, pageSize: f.pageSize, total });
  },

  POST: async (c) => {
    const s = await requireAuth(c.req, { roles: ['SuperAdmin'] });
    const b = parse(createAccount, c.body);
    const [{ id: barangayId }] = await sql()`select ekapon.find_barangay(${b.barangay}) as id`;
    if (!barangayId) throw unprocessable('UNKNOWN_BARANGAY', 'Choose one of the 62 official barangays.', { field: 'barangay' });
    const result = await tx(s.id, async (q) => {
      return createPortalAccount(q, b, barangayId);
    });
    const account = await findAccount(String(result.id));
    return created({ account: toAccount(account!), temporaryPassword: result.temporaryPassword, expiresInMinutes: 15, notice: 'Shown once. Give it to the user now; it expires in 15 minutes.' });
  },
});
