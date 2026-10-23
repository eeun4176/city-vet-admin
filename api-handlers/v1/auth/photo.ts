import { z } from 'zod';
import { route, ok, parse } from '../../../server/http';
import { requireAuth } from '../../../server/auth';
import { sql, tx } from '../../../server/db';
import { unprocessable } from '../../../server/errors';
import { readPrivateFile, storePrivateFile } from '../../../server/privateFiles';

const photo = z.object({
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.string().min(1).max(2_800_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

function hasValidSignature(mime: string, bytes: Buffer): boolean {
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { allowMaintenance: true });
    const [row] = await sql()`select profile_file_id, profile_photo_mime as "mimeType", encode(profile_photo, 'base64') as data from ekapon.account_preferences where account_id = ${session.id}`;
    if (row?.profile_file_id) { const file = await readPrivateFile(row.profile_file_id); return ok({ photo: { mimeType: file.mime, data: file.data } }); }
    return ok({ photo: row ? { mimeType: row.mimeType, data: row.data } : null });
  },
  PUT: async (c) => {
    const session = await requireAuth(c.req, { allowMaintenance: true });
    const input = parse(photo, c.body);
    const bytes = Buffer.from(input.data, 'base64');
    if (bytes.length > 2 * 1024 * 1024 || bytes.toString('base64') !== input.data || !hasValidSignature(input.mimeType, bytes)) {
      throw unprocessable('INVALID_PROFILE_PHOTO', 'Use a valid JPEG, PNG or WebP image no larger than 2 MB.');
    }
    const fileId = await storePrivateFile(bytes, input.mimeType, 'profiles');
    await tx(session.id, (q) => q`
      insert into ekapon.account_preferences (account_id, profile_photo, profile_photo_mime, profile_file_id)
      values (${session.id}, ${fileId ? null : bytes}, ${input.mimeType}, ${fileId}::uuid)
      on conflict (account_id) do update set profile_photo = excluded.profile_photo,
        profile_file_id = excluded.profile_file_id,
        profile_photo_mime = excluded.profile_photo_mime, updated_at = now()`);
    return ok({ saved: true });
  },
  DELETE: async (c) => {
    const session = await requireAuth(c.req, { allowMaintenance: true });
    await tx(session.id, (q) => q`update ekapon.account_preferences set profile_photo = null, profile_photo_mime = null, profile_file_id = null, updated_at = now() where account_id = ${session.id}`);
    return ok({ saved: true });
  },
}, { maxBody: 3_000_000 });
