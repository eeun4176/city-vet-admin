import { z } from 'zod';
import { route, ok, parse } from '../../../server/http';
import { requireAuth } from '../../../server/auth';
import { tx } from '../../../server/db';

const body = z.object({
  locale: z.enum(['en', 'fil']).optional(),
  theme: z.enum(['light', 'dark']).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Choose a preference to update.' });

export default route({
  PUT: async (c) => {
    const session = await requireAuth(c.req, { allowMaintenance: true });
    const preference = parse(body, c.body);
    await tx(session.id, async (q) => {
      if (preference.locale) await q`update ekapon.accounts set locale = ${preference.locale} where id = ${session.id}`;
      if (preference.theme !== undefined) {
        await q`
          insert into ekapon.account_preferences (account_id, theme)
          values (${session.id}, ${preference.theme})
          on conflict (account_id) do update set theme = excluded.theme, updated_at = now()`;
      }
    });
    return ok(preference);
  },
});
