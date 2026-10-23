import { z } from 'zod';
import { route, ok, parse } from '../../../server/http';
import { sql } from '../../../server/db';
import { requireAuth } from '../../../server/auth';

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const month = c.query.month === undefined ? null : parse(z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/), c.query.month);
    const start = month ? `${month}-01` : '';
    const end = month ? new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)).toISOString().slice(0,10) : '';
    const rows = await sql()`
      select jsonb_build_object('id',d.record_id,'title',coalesce(d.record_data->>'title',d.record_data->>'name',d.record_data->>'program','App event'),
        'date',coalesce(d.record_data->>'date',d.record_data->>'startDate',d.record_data->>'start_date',d.record_data->>'program_date',d.record_data->>'eventDate',d.record_data->>'programDate',''),
        'barangay',coalesce(b.name,d.record_data->>'barangay',''),'status',coalesce(d.record_data->>'status',''),
        'kind',coalesce(d.record_data->>'type',d.record_data->>'kind',d.record_data->>'category','')) as record_data from ekapon.dashboard_records d
      left join ekapon.program_interest_campaigns c on c.program_record_id=d.id
      left join ekapon.barangays b on b.id=coalesce(case when coalesce(d.record_data->>'barangayId','') ~ '^[0-9]{1,6}$' then (d.record_data->>'barangayId')::int end,ekapon.find_barangay(d.record_data->>'barangay'))
       where d.dataset = 'programs' and not d.archived
         and (${month}::text is null or (substring(coalesce(d.record_data->>'date',d.record_data->>'startDate',d.record_data->>'start_date',d.record_data->>'program_date',d.record_data->>'eventDate',d.record_data->>'programDate','') from 1 for 10)>=${start} and substring(coalesce(d.record_data->>'date',d.record_data->>'startDate',d.record_data->>'start_date',d.record_data->>'program_date',d.record_data->>'eventDate',d.record_data->>'programDate','') from 1 for 10)<${end}))
         and (${session.type !== 'Paravet'} or b.id=${session.barangayId ?? -1} or exists(select 1 from ekapon.program_interest_allowed_barangays a where a.campaign_id=c.id and a.barangay_id=${session.barangayId ?? -1}))
       order by d.record_data->>'date' asc limit 500`;
    return ok({ data: rows.map((row) => row.record_data) });
  },
});
