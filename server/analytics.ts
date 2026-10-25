export interface MonthlyOperationalRow {
  year: number;
  month: number;
  petRegistrations: number;
  antiRabiesServices: number;
  spayNeuterServices: number;
  microchipServices: number;
  programs: number;
  households: number;
  animals: number;
}

export interface MonthlyComparison {
  month: number;
  current: Omit<MonthlyOperationalRow, 'year' | 'month'>;
  previous: Omit<MonthlyOperationalRow, 'year' | 'month'>;
  currentObserved: boolean;
  previousObserved: boolean;
}

const metricKeys = [
  'petRegistrations',
  'antiRabiesServices',
  'spayNeuterServices',
  'microchipServices',
  'programs',
  'households',
  'animals',
] as const;

type MetricKey = (typeof metricKeys)[number];

export interface PlanningCoverage {
  available: boolean;
  sampleSize: number;
  observedMonths: number;
  reason: 'sample-source' | 'insufficient-months' | 'insufficient-records' | null;
}

export function planningCoverage(
  monthlyRecordCounts: Array<{ month: number; records: number }>,
  source: 'live' | 'sample',
): PlanningCoverage {
  const observed = monthlyRecordCounts.filter(({ records }) => records > 0);
  const sampleSize = observed.reduce((total, { records }) => total + records, 0);
  const reason = source === 'sample'
    ? 'sample-source'
    : observed.length < 3
      ? 'insufficient-months'
      : sampleSize < 10
        ? 'insufficient-records'
        : null;
  return {
    available: reason === null,
    sampleSize,
    observedMonths: observed.length,
    reason,
  };
}

export function monthlyCalendar(year: number, rows: MonthlyOperationalRow[]): MonthlyComparison[] {
  const byPeriod = new Map(rows.map((row) => [`${row.year}-${row.month}`, row]));
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const currentRow = byPeriod.get(`${year}-${month}`);
    const previousRow = byPeriod.get(`${year - 1}-${month}`);
    const current = Object.fromEntries(metricKeys.map((key) => [key, currentRow?.[key] ?? 0])) as MonthlyComparison['current'];
    const previous = Object.fromEntries(metricKeys.map((key) => [key, previousRow?.[key] ?? 0])) as MonthlyComparison['previous'];
    return { month, current, previous, currentObserved: Boolean(currentRow), previousObserved: Boolean(previousRow) };
  });
}

export function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function trailingThreeMonthAverage(
  calendar: MonthlyComparison[],
  metric: MetricKey,
  throughMonth: number,
): number | null {
  if (throughMonth < 3) return null;
  const values = calendar
    .filter(({ month }) => month >= throughMonth - 2 && month <= throughMonth)
    .map(({ current }) => current[metric]);
  if (values.length !== 3) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** The last month of `year` that is over on `todayIso` (Manila date): 12 for past years, 0 for future ones. */
export function lastCompleteMonth(year: number, todayIso: string): number {
  const [currentYear, currentMonth] = todayIso.split('-').map(Number);
  return year < currentYear ? 12 : year > currentYear ? 0 : currentMonth - 1;
}

/** The three calendar months ending with the latest month that has records; a month without records counts as zero. */
export function planningWindow(rows: Array<{ month: number; records: number }>): number[] {
  const last = rows.reduce((latest, row) => (row.records > 0 ? Math.max(latest, row.month) : latest), 0);
  return last ? [last - 2, last - 1, last].filter((month) => month >= 1) : [];
}

export function activeMonth(row: MonthlyOperationalRow): boolean {
  return metricKeys.some((key) => row[key] > 0);
}
