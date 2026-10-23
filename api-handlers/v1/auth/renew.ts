import { route, ok } from '../../../server/http';
import { requireAuth, sessionToken } from '../../../server/auth';
import { forbidden } from '../../../server/errors';

/** Salin swaps its still-valid token for a fresh one while online, so active paravets rarely sign in again. The account is re-checked like on any request. */
export default route({
  POST: async (c) => {
    const s = await requireAuth(c.req);
    if (s.client !== 'salin') throw forbidden('Only the Salin app renews its session.');
    return ok({ account: { id: s.id, type: s.type, name: s.name, username: s.username, accountKey: s.key, barangayId: s.barangayId, barangay: s.barangay }, ...(await sessionToken({ id: s.id, type: s.type }, 'full')) });
  },
});
