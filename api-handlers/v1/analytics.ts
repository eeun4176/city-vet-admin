import { z } from 'zod';
import { route, ok, parse } from '../../server/http';
import { sql } from '../../server/db';
import { requireAuth } from '../../server/auth';
import { forbidden } from '../../server/errors';
import { likePattern } from '../../server/listing';
import { ANALYTICS_METHODOLOGY_VERSION } from '../../shared/analytics';
import { readSummary, summaryHeaders } from '../../server/summaryCache';
import {
  activeMonth,
  monthlyCalendar,
  planningCoverage,
  percentageChange,
  type MonthlyComparison,
  type MonthlyOperationalRow,
} from '../../server/analytics';

const DATASETS = ['owners', 'pets', 'households', 'animals', 'programs', 'services', 'stubs'] as const;
const PARAVET_READ_DATASETS = ['owners', 'pets', 'households', 'animals'] as const;

const query = z.object({
  mode: z.enum(['summary', 'records']).default('summary'),
  source: z.enum(['live', 'sample']).default('live'),
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
  dateScope: z.enum(['year', 'all']).default('year'),
  q: z.string().trim().max(120).default(''),
  dataset: z.enum(['all', ...DATASETS]).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const petVaccineFlag = `(case when record_data->>'vaccinationStatus' in ('Yes','No','Unknown') then record_data->>'vaccinationStatus'='Yes' else (
  lower(coalesce(record_data->>'vaccine_1st', record_data->>'vaccine1st', 'false')) in ('true', 'yes', '1')
  or lower(coalesce(record_data->>'vaccine_2nd', record_data->>'vaccine2nd', 'false')) in ('true', 'yes', '1')
  or lower(coalesce(record_data->>'vaccine_3rd', record_data->>'vaccine3rd', 'false')) in ('true', 'yes', '1')
  or lower(coalesce(record_data->>'booster', 'false')) in ('true', 'yes', '1')
  or nullif(btrim(coalesce(record_data->>'vaccine_other', record_data->>'vaccineOther', '')), '') is not null
) end)`;
const lapsedFlag = `lower(coalesce(record_data->>'laps', 'false')) in ('true', 'yes', '1')`;
const activityDate = `coalesce(
  nullif(record_data->>'date', ''),
  nullif(record_data->>'visit_date', ''),
  nullif(record_data->>'census_date', ''),
  nullif(record_data->>'registration_date', ''),
  nullif(record_data->>'created_at', ''),
  nullif(record_data->>'createdAt', '')
)`;
const validActivityDate = String.raw`^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])`;
const isCompleted = `lower(coalesce(record_data->>'outcome', record_data->>'status', '')) in ('completed', 'attended')`;

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const filters = parse(query, c.query);
    if (filters.source === 'sample' && session.type === 'Paravet') {
      throw forbidden('Sample analytics are available to Admin only.');
    }
    const sample = filters.source === 'sample';
    const citywide = session.type !== 'Paravet';
    const barangay = session.barangay ?? '';
    const year = filters.year;
    const previousYear = year - 1;
    const accessibleDatasets = citywide ? DATASETS : PARAVET_READ_DATASETS;

    if (filters.mode === 'records') {
      if (filters.dataset !== 'all' && !accessibleDatasets.some((dataset) => dataset === filters.dataset)) {
        throw forbidden('This dataset is not available to your account.');
      }
      const selectedDatasets = filters.dataset === 'all' ? accessibleDatasets : [filters.dataset];
      const params = [
        selectedDatasets,
        sample,
        citywide,
        barangay,
        filters.dateScope,
        year,
        filters.q,
        likePattern(filters.q),
      ];
      const dateSearch = `case when ${activityDate} ~ '${validActivityDate}' then substring(${activityDate} from 1 for 4)::int end`;
      const where = `dataset = any($1::text[])
        and archived = false
        and ($2 = coalesce(record_data->>'_sampleData' = 'true', false))
        and ($3 or lower(coalesce(record_data->>'barangay', '')) = lower($4))
        and ($5 = 'all' or ${dateSearch} = $6)
        and ($7 = '' or record_data::text ilike $8)`;
      const [count] = await sql().unsafe(
        `select count(*)::int as total from ekapon.dashboard_records where ${where}`,
        params as never[],
      ) as unknown as [{ total: number }];
      const rows = await sql().unsafe(
        `select dataset, record_id as id,
                coalesce(record_data->>'pet_name', record_data->>'petName', record_data->>'owner_name',
                         record_data->>'owner', record_data->>'name', record_data->>'title',
                         record_data->>'service', record_data->>'label', record_id) as label,
                coalesce(record_data->>'status', record_data->>'outcome', '') as status,
                coalesce(substring(${activityDate} from 1 for 10), '') as date,
                coalesce(record_data->>'barangay', '') as barangay,
                concat_ws(' · ', nullif(record_data->>'species', ''), nullif(record_data->>'service', ''),
                  nullif(record_data->>'paravet', ''), nullif(record_data->>'provider', '')) as detail
           from ekapon.dashboard_records
          where ${where}
          order by ${activityDate} desc nulls last, dataset, record_id
          limit ${filters.pageSize} offset ${(filters.page - 1) * filters.pageSize}`,
        params as never[],
      ) as unknown as Array<{
        dataset: string; id: string; label: string; status: string;
        date: string; barangay: string; detail: string;
      }>;
      return ok({
        source: filters.source,
        year,
        dateScope: filters.dateScope,
        dataset: filters.dataset,
        query: filters.q,
        page: filters.page,
        pageSize: filters.pageSize,
        total: Number(count.total),
        records: rows,
      });
    }

    const summary = await readSummary(`analytics:${session.type}:${session.barangayId ?? 0}:${filters.source}:${year}`, c.query.fresh === '1', async () => {
    const [totals] = await sql().unsafe(
      `select
         count(*) filter (where dataset = 'owners')::int as owners,
         count(*) filter (where dataset = 'pets')::int as pets,
         count(*) filter (where dataset = 'households')::int as households,
         count(*) filter (where dataset = 'animals')::int as animals,
         count(*) filter (where dataset = 'programs')::int as programs,
         count(*) filter (where dataset = 'services')::int as services,
         count(*) filter (where dataset = 'stubs')::int as stubs,
         count(*) filter (where dataset = 'pets' and lower(coalesce(record_data->>'species', '')) = 'dog')::int as dogs,
         count(*) filter (where dataset = 'pets' and lower(coalesce(record_data->>'species', '')) = 'cat')::int as cats,
         count(*) filter (where dataset = 'pets' and lower(coalesce(record_data->>'species', '')) not in ('dog', 'cat'))::int as other_species,
         count(*) filter (where dataset = 'pets' and ${petVaccineFlag})::int as documented_vaccine_flags,
         count(*) filter (where dataset = 'pets' and ${lapsedFlag})::int as laps_records,
         count(*) filter (where dataset = 'pets' and lower(coalesce(record_data->>'sterilizationStatus',record_data->>'sterilized', 'false')) in ('true', 'yes', '1'))::int as sterilized
       from ekapon.dashboard_records
       where archived = false
         and dataset = any($1::text[])
         and ($2 = coalesce(record_data->>'_sampleData' = 'true', false))
         and ($3 or lower(coalesce(record_data->>'barangay', '')) = lower($4))`,
      [DATASETS, sample, citywide, barangay],
    ) as unknown as Array<Record<string, number>>;

    const [dataQuality] = await sql().unsafe(
      `select
         count(*) filter (where not archived and record_data->>'_syntheticData'='true')::int as synthetic_records,
         count(*) filter (where archived)::int as archived_records_excluded,
         count(*) filter (where not archived and ${activityDate} ~ '${validActivityDate}')::int as records_with_valid_activity_date,
         count(*) filter (where not archived and (${activityDate} is null or ${activityDate} !~ '${validActivityDate}'))::int as records_missing_or_invalid_activity_date,
         count(*) filter (where not archived and nullif(btrim(record_data->>'barangay'), '') is null)::int as records_missing_barangay,
         count(*) filter (where not archived and dataset = 'pets' and nullif(btrim(record_data->>'species'), '') is null)::int as pet_records_missing_species,
         count(*) filter (where not archived and dataset = 'pets' and not ${petVaccineFlag})::int as pet_records_without_vaccine_flag,
         count(*) filter (where not archived and dataset = 'services' and nullif(btrim(record_data->>'service'), '') is null)::int as service_records_missing_type
       from ekapon.dashboard_records
       where dataset = any($1::text[])
         and ($2 = coalesce(record_data->>'_sampleData' = 'true', false))
         and ($3 or lower(coalesce(record_data->>'barangay', '')) = lower($4))`,
      [DATASETS, sample, citywide, barangay],
    ) as unknown as [{
      synthetic_records:number;
      archived_records_excluded: number;
      records_with_valid_activity_date: number;
      records_missing_or_invalid_activity_date: number;
      records_missing_barangay: number;
      pet_records_missing_species: number;
      pet_records_without_vaccine_flag: number;
      service_records_missing_type: number;
    }];

    const barangays = await sql().unsafe(
      `select coalesce(nullif(btrim(record_data->>'barangay'), ''), 'Unspecified') as barangay,
              count(*)::int as pets,
              count(*) filter (where ${petVaccineFlag})::int as documented_vaccine_flags,
              count(*) filter (where ${lapsedFlag})::int as laps_records,
              count(*) filter (where not ${petVaccineFlag})::int as without_vaccine_flags
         from ekapon.dashboard_records
        where dataset = 'pets' and archived = false
          and (${sample} = coalesce(record_data->>'_sampleData' = 'true', false))
          and (${citywide} or lower(coalesce(record_data->>'barangay', '')) = lower($1))
        group by 1
        order by laps_records desc, without_vaccine_flags desc, pets desc, barangay
        limit 30`,
      [barangay],
    ) as unknown as Array<{
      barangay: string;
      pets: number;
      documented_vaccine_flags: number;
      laps_records: number;
      without_vaccine_flags: number;
    }>;

    const monthlyRows = await sql().unsafe(
      `with dated as (
         select dataset, record_data,
                substring(${activityDate} from 1 for 4)::int as year,
                substring(${activityDate} from 6 for 2)::int as month
           from ekapon.dashboard_records
          where archived = false
            and dataset = any($1::text[])
            and ($2 = coalesce(record_data->>'_sampleData' = 'true', false))
            and ($3 or lower(coalesce(record_data->>'barangay', '')) = lower($4))
            and ${activityDate} ~ '${validActivityDate}'
       )
       select year, month,
              count(*) filter (where dataset = 'pets')::int as "petRegistrations",
              count(*) filter (where dataset = 'services'
                and lower(coalesce(record_data->>'service', '')) like '%anti-rab%'
                and ${isCompleted})::int as "antiRabiesServices",
              coalesce(sum(case
                when record_data->>'source' = 'spay-neuter-monthly-report'
                  and coalesce(record_data->>'totalProcedures', '') ~ '^[0-9]+$'
                then (record_data->>'totalProcedures')::int
                else 1 end) filter (where dataset = 'services'
                and lower(coalesce(record_data->>'service', '')) ~ '(kapon|neuter|spay)'
                and ${isCompleted}), 0)::int as "spayNeuterServices",
              count(*) filter (where dataset = 'services'
                and lower(coalesce(record_data->>'service', '')) like '%microchip%'
                and ${isCompleted})::int as "microchipServices",
              count(*) filter (where dataset = 'programs')::int as programs,
              count(*) filter (where dataset = 'households')::int as households,
              count(*) filter (where dataset = 'animals')::int as animals
         from dated
        where year in ($5, $6)
        group by year, month
        order by year, month`,
      [DATASETS, sample, citywide, barangay, previousYear, year],
    ) as unknown as MonthlyOperationalRow[];

    const planningMonthRows = sample ? [] : await sql().unsafe(
      `select substring(${activityDate} from 6 for 2)::int as month, count(*)::int as records,
         count(*) filter(where lower(coalesce(record_data->>'service','')) ~ '(rabies|vaccin)')::int as "antiRabiesServices",
         coalesce(sum(case when record_data->>'recordOrigin'='Spay and Neuter Monthly Report' and coalesce(record_data->>'totalProcedures','') ~ '^[0-9]+$' then (record_data->>'totalProcedures')::int else 1 end) filter(where lower(coalesce(record_data->>'service','')) ~ '(kapon|neuter|spay)'),0)::int as "spayNeuterServices"
         from ekapon.dashboard_records
        where dataset = 'services' and archived = false
          and record_data->>'_sampleData' is distinct from 'true'
          and record_data->>'_syntheticData' is distinct from 'true'
          and ($1 or lower(coalesce(record_data->>'barangay', '')) = lower($2))
          and ${activityDate} ~ '${validActivityDate}'
          and substring(${activityDate} from 1 for 4)::int = $3
          and ${isCompleted}
        group by 1
        order by 1`,
      [citywide, barangay, year],
    ) as unknown as Array<{ month: number; records: number;antiRabiesServices:number;spayNeuterServices:number }>;

    const serviceBreakdown = await sql().unsafe(
      `select coalesce(nullif(btrim(record_data->>'service'), ''), 'Unspecified') as service,
              count(*)::int as total,
              count(*) filter (where ${isCompleted})::int as completed
         from ekapon.dashboard_records
        where dataset = 'services' and archived = false
          and (${sample} = coalesce(record_data->>'_sampleData' = 'true', false))
          and (${citywide} or lower(coalesce(record_data->>'barangay', '')) = lower($1))
        group by 1
        order by total desc, service
        limit 20`,
      [barangay],
    ) as unknown as Array<{ service: string; total: number; completed: number }>;

    const barangayActivity = await sql().unsafe(
      `with monthly as (
         select coalesce(nullif(btrim(record_data->>'barangay'), ''), 'Unspecified') as barangay,
                substring(${activityDate} from 6 for 2)::int as month,
                count(*) filter (where lower(coalesce(record_data->>'service', '')) like '%anti-rab%')::int as anti_rabies,
                coalesce(sum(case
                  when record_data->>'source' = 'spay-neuter-monthly-report'
                    and coalesce(record_data->>'totalProcedures', '') ~ '^[0-9]+$'
                  then (record_data->>'totalProcedures')::int
                  else 1 end) filter (where lower(coalesce(record_data->>'service', '')) ~ '(kapon|neuter|spay)'), 0)::int as kapon
           from ekapon.dashboard_records
          where dataset = 'services' and archived = false
            and (${sample} = coalesce(record_data->>'_sampleData' = 'true', false))
            and (${citywide} or lower(coalesce(record_data->>'barangay', '')) = lower($1))
            and ${activityDate} ~ '${validActivityDate}'
            and substring(${activityDate} from 1 for 4)::int = $2
            and ${isCompleted}
          group by 1, 2
       ), ranked as (
         select barangay, sum(anti_rabies + kapon) as total
           from monthly
          group by barangay
          order by total desc, barangay
          limit 30
       )
       select monthly.barangay, monthly.month, monthly.anti_rabies as "antiRabies",
              monthly.kapon, ranked.total as "totalActivity"
         from monthly join ranked using (barangay)
        order by ranked.total desc, monthly.barangay, monthly.month`,
      [barangay, year],
    ) as unknown as Array<{
      barangay: string;
      month: number;
      antiRabies: number;
      kapon: number;
      totalActivity: number;
    }>;

    const calendar = monthlyCalendar(year, monthlyRows);
    const currentRows = monthlyRows.filter((row) => row.year === year);
    const throughMonth = currentRows.filter(activeMonth).reduce((latest, row) => Math.max(latest, row.month), 0);
    const comparisonMonths = calendar.slice(0, throughMonth);
    const sum = (key: keyof MonthlyComparison['current'], side: 'current' | 'previous') =>
      comparisonMonths.reduce((total, month) => total + month[side][key], 0);
    const currentVaccinationServices = sum('antiRabiesServices', 'current');
    const previousVaccinationServices = sum('antiRabiesServices', 'previous');
    const currentSpayNeuterServices = sum('spayNeuterServices', 'current');
    const previousSpayNeuterServices = sum('spayNeuterServices', 'previous');
    const planning = planningCoverage(planningMonthRows, filters.source);
    const planningMonths = planningMonthRows
      .filter(({ records }) => records > 0)
      .slice(-3)
      .map(({ month }) => month);
    const planningMean = (metric:'antiRabiesServices'|'spayNeuterServices') => {
      if (!planning.available) return null;
      const months = planningMonthRows.filter((row) => planningMonths.includes(row.month));
      return Math.round(months.reduce((sum, row) => sum + Number(row[metric]), 0) / months.length);
    };
    const forecastVaccinationServices = planningMean('antiRabiesServices');
    const forecastSpayNeuterServices = planningMean('spayNeuterServices');
    const leadingBarangay = barangays[0];
    const vaccineGap = Number(totals.pets) - Number(totals.documented_vaccine_flags);
    const recommendations = [
      Number(totals.laps_records) > 0
        ? {
          type: 'laps-follow-up',
          count: Number(totals.laps_records),
          barangay: leadingBarangay?.laps_records ? leadingBarangay.barangay : null,
        }
        : {
          type: 'verify-vaccine-records',
          count: vaccineGap,
          barangay: leadingBarangay?.without_vaccine_flags ? leadingBarangay.barangay : null,
        },
      forecastVaccinationServices !== null
        ? { type: 'planning-baseline', antiRabiesServices: forecastVaccinationServices, spayNeuterServices: forecastSpayNeuterServices ?? 0 }
        : { type: 'insufficient-history' },
    ];

    const vaccinationChange = percentageChange(currentVaccinationServices, previousVaccinationServices);
    const surgeryChange = percentageChange(currentSpayNeuterServices, previousSpayNeuterServices);
    const documentedRate = Number(totals.pets) > 0
      ? Math.round((Number(totals.documented_vaccine_flags) / Number(totals.pets)) * 100)
      : null;

    return {
      source: filters.source,
      year,
      previousYear,
      syntheticRecords:Number(dataQuality.synthetic_records),
      comparisonMonths: throughMonth,
      evidence: {
        methodologyVersion: ANALYTICS_METHODOLOGY_VERSION,
        generatedAt: new Date().toISOString(),
        scope: {
          barangay: citywide ? null : barangay,
          totals: 'All active records in the selected source and accessible barangay scope; not restricted to the selected year.',
          trends: throughMonth
            ? `January through month ${throughMonth} of ${year}, compared with the same months in ${previousYear}.`
            : `No activity months were recorded in ${year}; no year-over-year months are included.`,
        },
        dataQuality: {
          archivedRecordsExcluded: Number(dataQuality.archived_records_excluded),
          recordsWithValidActivityDate: Number(dataQuality.records_with_valid_activity_date),
          recordsMissingOrInvalidActivityDate: Number(dataQuality.records_missing_or_invalid_activity_date),
          recordsMissingBarangay: Number(dataQuality.records_missing_barangay),
          petRecordsMissingSpecies: Number(dataQuality.pet_records_missing_species),
          petRecordsWithoutVaccineFlag: Number(dataQuality.pet_records_without_vaccine_flag),
          serviceRecordsMissingType: Number(dataQuality.service_records_missing_type),
        },
        countsByDataset: {
          owners: Number(totals.owners),
          pets: Number(totals.pets),
          households: Number(totals.households),
          animals: Number(totals.animals),
          programs: Number(totals.programs),
          services: Number(totals.services),
          stubs: Number(totals.stubs),
        },
      },
      totals: {
        ...totals,
        documented_vaccine_flags: Number(totals.documented_vaccine_flags),
        vaccine_flag_record_rate: documentedRate,
        pet_population_coverage_rate: null,
      },
      comparison: {
        antiRabiesServices: { current: currentVaccinationServices, previous: previousVaccinationServices, percentChange: vaccinationChange },
        spayNeuterServices: { current: currentSpayNeuterServices, previous: previousSpayNeuterServices, percentChange: surgeryChange },
      },
      forecast: {
        antiRabiesServices: forecastVaccinationServices,
        spayNeuterServices: forecastSpayNeuterServices,
        sampleSize: planning.sampleSize,
        observedMonths: planning.observedMonths,
        available: planning.available,
        reason: planning.reason,
        months: planningMonths,
        method: 'mean of the latest three months with completed, validly dated live service records in the selected year; shown only with at least 10 records across 3 distinct calendar months',
      },
      monthly: calendar,
      barangays,
      serviceBreakdown,
      barangayActivity,
      recommendations,
      limitations: ['sample-isolation', 'vaccine-coverage', 'risk-thresholds', 'unsupported-domains', 'forecast-limitations'] as const,
    };
    });
    return ok(summary.value, summaryHeaders(summary));
  },
});
