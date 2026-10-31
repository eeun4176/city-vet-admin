import { describe, expect, it } from 'vitest';
import { petOutcome, programKpis, type KpiInput } from '../server/programKpis';

const done = (processes: string[]) => ({ species: 'Dog', processes, outcome: 'Completed' });
const input: KpiInput = {
  today: '2026-10-26',
  barangays: [{ id: 1, name: 'Assumption' }, { id: 2, name: 'Kaypian' }],
  programs: [
    { id: 10, title: 'Past Kapon', date: '2026-09-01', status: 'Completed', hostBarangayId: 1, hostBarangay: 'Assumption', capacity: 10 },
    { id: 11, title: 'Today Kapon', date: '2026-10-26', status: 'Open', hostBarangayId: 2, hostBarangay: 'Kaypian', capacity: 4 },
  ],
  stubs: [
    { campaignId: 10, status: 'Redeemed', barangayId: 1, pets: 2 },
    { campaignId: 10, status: 'Issued', barangayId: 1, pets: 3 },
    { campaignId: 11, status: 'Issued', barangayId: 2, pets: 1 },
  ],
  attendance: [
    { campaignId: 10, source: 'Stub', barangayId: 1, attendedOn: '2026-09-01', pets: [done(['Neuter/Spay']), { processes: ['Neuter/Spay', 'Anti-Rabies Vaccine'], processOutcomes: { 'Neuter/Spay': 'Deferred', 'Anti-Rabies Vaccine': 'Completed' } }] },
    { campaignId: 10, source: 'Walk-in', barangayId: 2, attendedOn: '2026-09-01', pets: [{ processes: ['Neuter/Spay'], outcome: 'Deferred' }] },
  ],
  interest: [{ barangayId: 1, pets: 8 }, { barangayId: 2, pets: 2 }],
  registry: [{ barangayId: 1, species: 'Dog', vaccinated: true, sterilized: false }, { barangayId: 1, species: 'Cat', vaccinated: false, sterilized: true }, { barangayId: 2, species: 'Dog', vaccinated: true, sterilized: true }, { barangayId: null, species: 'Dog', vaccinated: false, sterilized: false }],
};

describe('program KPIs', () => {
  it('classifies each attended pet by its services', () => {
    expect(petOutcome(done(['Neuter/Spay', 'Microchipping']))).toBe('completed');
    expect(petOutcome({ processes: ['Neuter/Spay'], outcome: 'Deferred' })).toBe('deferred');
    expect(petOutcome({ processes: ['Neuter/Spay'], outcome: 'Not eligible' })).toBe('notEligible');
    expect(petOutcome({ processes: ['A', 'B'], processOutcomes: { A: 'Completed', B: 'Deferred' } })).toBe('incomplete');
    expect(petOutcome({ processes: [] })).toBe('incomplete');
  });

  it('applies the documented formulas in pets', () => {
    const { overview, services, monthly } = programKpis(input);
    expect(overview).toMatchObject({ capacity: 14, registered: 6, stubAttended: 2, attended: 3, walkIns: 1, completed: 1, deferred: 1, incomplete: 1, noShows: 3, notYetScanned: 1, interested: 10, census: 4 });
    expect(overview.capacityUtilization).toBe(21.4); // 3 / 14
    expect(overview.registrationUtilization).toBe(42.9); // 6 / 14
    expect(overview.attendanceRate).toBe(33.3); // 2 stub pets / 6 registered
    expect(overview.completionRate).toBe(33.3); // 1 / 3
    expect(overview.unusedCapacity).toBe(11);
    expect(overview.registrationDropoff).toBe(4);
    expect(overview.interestConversion).toBe(60); // 6 / 10
    expect(overview).toMatchObject({ dogShare: 75, catShare: 25, vaccinationCoverage: 50, censusInterestRate: 250 });
    expect(services).toEqual([{ process: 'Neuter/Spay', completed: 1 }, { process: 'Anti-Rabies Vaccine', completed: 1 }, { process: 'Microchipping', completed: 0 }]);
    expect(monthly[8]).toEqual({ month: 9, attended: 3, completed: 1 });
  });

  it('reconciles, splits by barangay and program, and never divides by zero', () => {
    const k = programKpis(input);
    expect(k.checks.every((c) => c.ok)).toBe(true);
    expect(k.barangays.find((b) => b.id === 1)).toMatchObject({ registered: 5, attended: 2, noShows: 3, attendanceRate: 40, kapon: 1, antiRabies: 1 });
    expect(k.programs.find((p) => p.id === 11)).toMatchObject({ live: true, registered: 1, notYetScanned: 1, attended: 0, capacityUtilization: 0 });
    const empty = programKpis({ ...input, programs: [], stubs: [], attendance: [], interest: [], registry: [] });
    expect(empty.overview).toMatchObject({ capacityUtilization: null, attendanceRate: null, completionRate: null, interestConversion: null });
    expect(empty.insights).toEqual([]);
  });

  it('flags a program above capacity', () => {
    const k = programKpis({ ...input, programs: input.programs.map((p) => (p.id === 10 ? { ...p, capacity: 2 } : p)) });
    expect(k.checks.find((c) => c.label.includes('capacity'))).toMatchObject({ ok: false, detail: 'Past Kapon' });
  });

  it('reports pets above capacity instead of negative unused slots', () => {
    // 2 pets came to a 1-slot program: 200% is the true figure; the other program's empty slots are not cancelled out.
    const k = programKpis({ ...input, programs: input.programs.map((p) => (p.id === 10 ? { ...p, capacity: 1 } : p)), attendance: [input.attendance[0]] });
    expect(k.programs.find((p) => p.id === 10)).toMatchObject({ attended: 2, capacityUtilization: 200, unusedCapacity: 0, overCapacity: 1, aboveCapacity: true });
    expect(k.overview).toMatchObject({ capacity: 5, capacityAttended: 2, capacityUtilization: 40, unusedCapacity: 4, overCapacity: 1 });
    expect(k.insights[0]).toContain('1 above capacity');
  });

  it('measures capacity only on programs that have one', () => {
    const k = programKpis({ ...input, programs: input.programs.map((p) => (p.id === 10 ? { ...p, capacity: null } : p)) });
    expect(k.overview).toMatchObject({ capacity: 4, attended: 3, capacityAttended: 0, capacityUtilization: 0, unusedCapacity: 4, overCapacity: 0 });
    expect(k.programs.find((p) => p.id === 10)).toMatchObject({ capacityUtilization: null, unusedCapacity: null });
  });
});

describe('GET /api/v1/program-kpis', () => {
  it('returns the KPIs, tables and checks for an Admin and refuses a Paravet', async () => {
    const { startServer, client } = await import('./harness');
    const { sql, closeDb } = await import('../server/db');
    const { sessionCookie } = await import('../server/auth');
    const server = await startServer(), call = client(server.base);
    const tag = `Kpi${Date.now()}`;
    const [area] = await sql()`select id from ekapon.barangays order by id limit 1`;
    const rows = await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id) values(${tag},'SuperAdmin',${tag},'Admin',null),(null,'Paravet',${tag},'Paravet',${area.id}) returning id,account_type::text as type`;
    try {
      const [admin, paravet] = await Promise.all(rows.map(async (r) => (await sessionCookie({ id: r.id, type: r.type }, 'full')).split(';')[0]));
      const reply = await call('GET', '/api/v1/program-kpis?year=2026', { cookie: admin });
      expect(reply.status, JSON.stringify(reply.json)).toBe(200);
      expect(reply.json).toMatchObject({ filters: { year: 2026 }, overview: expect.objectContaining({ capacity: expect.any(Number) }), monthly: expect.any(Array), checks: expect.any(Array) });
      expect((await call('GET', '/api/v1/program-kpis', { cookie: paravet })).status).toBe(403);
    } finally {
      await sql()`delete from ekapon.accounts where id = any(${rows.map((r) => r.id)}::bigint[])`;
      await server.close(); await closeDb();
    }
  });
});
