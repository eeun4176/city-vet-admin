import { route, ok } from '../../../server/http';
import { sql } from '../../../server/db';
import { AppError } from '../../../server/errors';
import { cleanupPrivateFiles } from '../../../server/privateFiles';

/**
 * Daily job started by Vercel Cron (vercel.json). It deletes ID photos and census images past their
 * retention date and clears old read notifications. A cron invocation does not guarantee uptime or
 * prevent an inactivity pause on a free-tier database. Set a unique CRON_SECRET in Vercel.
 */
export default route({
  GET: async (c) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || c.req.headers.authorization !== `Bearer ${secret}`) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Not allowed.');
    }
    const [setting] = await sql()`
      select setting_value = 'true'::jsonb as enabled
        from ekapon.system_settings where setting_key = 'keepalive_enabled'`;
    if (setting && !setting.enabled) return ok({ skipped: true });
    const [{ result }] = await sql()`select ekapon.run_daily_maintenance() as result`;
    const storedFilesDeleted = await cleanupPrivateFiles();
    return ok({ ...result, storedFilesDeleted });
  },
});
