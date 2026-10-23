import { describe, expect, it } from 'vitest';
import {
  activeMonth,
  monthlyCalendar,
  planningCoverage,
  percentageChange,
  trailingThreeMonthAverage,
  type MonthlyOperationalRow,
} from '../server/analytics';

describe('operational analytics helpers', () => {
  const rows: MonthlyOperationalRow[] = [
    { year: 2025, month: 1, petRegistrations: 2, antiRabiesServices: 1, spayNeuterServices: 0, microchipServices: 0, programs: 1, households: 3, animals: 4 },
    { year: 2026, month: 1, petRegistrations: 3, antiRabiesServices: 2, spayNeuterServices: 1, microchipServices: 0, programs: 1, households: 2, animals: 3 },
    { year: 2026, month: 2, petRegistrations: 4, antiRabiesServices: 3, spayNeuterServices: 2, microchipServices: 1, programs: 2, households: 3, animals: 5 },
    { year: 2026, month: 3, petRegistrations: 5, antiRabiesServices: 4, spayNeuterServices: 3, microchipServices: 1, programs: 2, households: 4, animals: 6 },
  ];

  it('returns a complete 12-month calendar and aligns the prior year by month', () => {
    const calendar = monthlyCalendar(2026, rows);
    expect(calendar).toHaveLength(12);
    expect(calendar[0]).toMatchObject({
      month: 1,
      current: { petRegistrations: 3, antiRabiesServices: 2 },
      previous: { petRegistrations: 2, antiRabiesServices: 1 },
      currentObserved: true,
      previousObserved: true,
    });
    expect(calendar[11].current.petRegistrations).toBe(0);
    expect(calendar[11].currentObserved).toBe(false);
    expect(calendar[11].previousObserved).toBe(false);
  });

  it('does not invent a percentage baseline when the prior period is zero', () => {
    expect(percentageChange(4, 2)).toBe(100);
    expect(percentageChange(0, 0)).toBeNull();
  });

  it('requires at least 10 valid live service records across three distinct months for planning', () => {
    expect(planningCoverage([{ month: 1, records: 4 }, { month: 2, records: 3 }, { month: 3, records: 3 }], 'live'))
      .toMatchObject({ available: true, sampleSize: 10, observedMonths: 3, reason: null });
    expect(planningCoverage([{ month: 1, records: 8 }, { month: 2, records: 1 }], 'live').reason)
      .toBe('insufficient-months');
    expect(planningCoverage([{ month: 1, records: 4 }, { month: 2, records: 3 }, { month: 3, records: 2 }], 'live').reason)
      .toBe('insufficient-records');
    expect(planningCoverage([{ month: 1, records: 100 }, { month: 2, records: 100 }, { month: 3, records: 100 }], 'sample'))
      .toMatchObject({ available: false, reason: 'sample-source' });
  });

  it('uses the trailing three calendar months as an explainable baseline', () => {
    const calendar = monthlyCalendar(2026, rows);
    expect(trailingThreeMonthAverage(calendar, 'antiRabiesServices', 3)).toBe(3);
    expect(trailingThreeMonthAverage(calendar, 'antiRabiesServices', 2)).toBeNull();
    expect(activeMonth(rows[0])).toBe(true);
  });
});
