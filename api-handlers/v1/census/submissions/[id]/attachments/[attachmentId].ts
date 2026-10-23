import { z } from 'zod';
import { route, ok, parse } from '../../../../../../server/http';
import { sql, tx } from '../../../../../../server/db';
import { requireAuth } from '../../../../../../server/auth';
import { notFound } from '../../../../../../server/errors';
import { accessSubmission, idParam } from '../../../../../../server/census';
import { readPrivateFile } from '../../../../../../server/privateFiles';

const attachmentParam = z.coerce.number().int().positive();

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const id = parse(idParam, c.query.id);
    const attachmentId = parse(attachmentParam, c.query.attachmentId);
    await accessSubmission(sql(), id, session);
    const [row] = await sql()`select mime, image, file_id from ekapon.census_attachments where id = ${attachmentId} and submission_id = ${id}::uuid`;
    if (!row) throw notFound('Photo not found. It may have been deleted after the retention period.');
    return ok(row.file_id ? await readPrivateFile(row.file_id) : { mime: row.mime, data: Buffer.from(row.image).toString('base64') });
  },

  DELETE: async (c) => {
    const session = await requireAuth(c.req, { roles: ['Paravet'] });
    const id = parse(idParam, c.query.id);
    const attachmentId = parse(attachmentParam, c.query.attachmentId);
    await tx(session.id, async (q) => {
      await accessSubmission(q, id, session, true);
      await q`delete from ekapon.census_attachments where id = ${attachmentId} and submission_id = ${id}::uuid`;
    });
    return ok({ deleted: true });
  },
});
