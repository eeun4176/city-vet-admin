import { route, ok } from '../../../server/http';
import { requireAuth } from '../../../server/auth';
import { sql } from '../../../server/db';
import { readPrivateFile } from '../../../server/privateFiles';

export default route({
  GET: async (c) => {
    const s = await requireAuth(c.req);
    const [preferences] = await sql()`
      select theme, profile_file_id,
             case when profile_photo is not null
               then 'data:' || profile_photo_mime || ';base64,' || encode(profile_photo, 'base64')
               else null end as "profilePhoto"
        from ekapon.account_preferences where account_id = ${s.id}`;
    const file = preferences?.profile_file_id ? await readPrivateFile(preferences.profile_file_id) : null;
    const [contact] = await sql()`select email from ekapon.accounts where id = ${s.id} and email_verified_at is not null`;
    return ok({
      account: {
        id: s.id, type: s.type, name: s.name, username: s.username,
        accountKey: s.key, barangayId: s.barangayId, barangay: s.barangay,
        locale: s.locale,
        theme: preferences?.theme ?? 'light',
        profilePhoto: file ? `data:${file.mime};base64,${file.data}` : preferences?.profilePhoto ?? null,
        grants: s.grants,
        // The confirmed email for password reset codes (Paravets set it in Salin).
        email: contact?.email ?? null,
      },
    });
  },
});
