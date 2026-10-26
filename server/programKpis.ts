/**
 * Program KPIs: the deterministic formulas behind Reports > Analytics (no AI, no estimates).
 * Every count is in pets. Registered = pets on encoded stubs; attended = pets in submitted attendance
 * (stub or walk-in); a pet is Completed when every selected service was completed, Deferred or Not eligible
 * when all of them were, and Incomplete otherwise. Rates are null when their denominator is 0.
 */

export type KpiProgram = { id: number; title: string; date: string; status: string; hostBarangayId: number; hostBarangay: string; capacity: number | null };
export type KpiStub = { campaignId: number; status: 'Issued' | 'Redeemed'; barangayId: number | null; pets: number };
export type KpiPet = { species?: string; processes?: string[]; outcome?: string; processOutcomes?: Record<string, string> };
export type KpiAttendance = { campaignId: number; source: string; barangayId: number; attendedOn: string; pets: KpiPet[] };
export type KpiInterest = { barangayId: number; pets: number };
export type KpiRegistryPet = { barangayId: number | null; species: string; vaccinated: boolean; sterilized: boolean };
export type KpiInput = { programs: KpiProgram[]; stubs: KpiStub[]; attendance: KpiAttendance[]; interest: KpiInterest[]; registry: KpiRegistryPet[]; barangays: { id: number; name: string }[]; today: string };

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const SERVICES = ['Neuter/Spay', 'Anti-Rabies Vaccine', 'Microchipping'] as const;

type Outcome = 'completed' | 'deferred' | 'notEligible' | 'incomplete';
export function petOutcome(pet: KpiPet): Outcome {
  const results = (pet.processes ?? []).map((process) => pet.processOutcomes?.[process] ?? pet.outcome ?? '');
  if (results.length && results.every((r) => r === 'Completed')) return 'completed';
  if (results.length && results.every((r) => r === 'Not eligible')) return 'notEligible';
  if (results.length && !results.includes('Completed') && results.every((r) => r === 'Deferred' || r === 'Not eligible')) return 'deferred';
  return 'incomplete';
}

type Tally = { capacity: number; registered: number; stubAttended: number; attended: number; walkIns: number; completed: number; deferred: number; notEligible: number; incomplete: number; noShows: number; notYetScanned: number; services: Record<string, number> };
const tally = (): Tally => ({ capacity: 0, registered: 0, stubAttended: 0, attended: 0, walkIns: 0, completed: 0, deferred: 0, notEligible: 0, incomplete: 0, noShows: 0, notYetScanned: 0, services: Object.fromEntries(SERVICES.map((s) => [s, 0])) });

function rates(t: Tally) {
  return {
    capacityUtilization: pct(t.attended, t.capacity),
    registrationUtilization: pct(t.registered, t.capacity),
    attendanceRate: pct(t.stubAttended, t.registered),
    completionRate: pct(t.completed, t.attended),
    unusedCapacity: t.capacity ? t.capacity - t.attended : null,
    registrationDropoff: t.registered - t.stubAttended,
  };
}

export function programKpis(input: KpiInput) {
  const programs = new Map(input.programs.map((p) => [p.id, p]));
  const total = tally();
  const byProgram = new Map(input.programs.map((p) => [p.id, tally()]));
  const byBarangay = new Map<number, Tally & { interested: number }>();
  const area = (id: number | null) => {
    if (id === null) return null;
    if (!byBarangay.has(id)) byBarangay.set(id, { ...tally(), interested: 0 });
    return byBarangay.get(id)!;
  };
  const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, attended: 0, completed: 0 }));

  for (const p of input.programs) { total.capacity += p.capacity ?? 0; byProgram.get(p.id)!.capacity = p.capacity ?? 0; }
  for (const s of input.stubs) {
    const over = (programs.get(s.campaignId)?.date ?? '') < input.today;
    for (const t of [total, byProgram.get(s.campaignId), area(s.barangayId)]) {
      if (!t) continue;
      t.registered += s.pets;
      if (s.status === 'Redeemed') t.stubAttended += s.pets;
      else if (over) t.noShows += s.pets;
      else t.notYetScanned += s.pets;
    }
  }
  for (const a of input.attendance) {
    const month = monthly[Number(a.attendedOn.slice(5, 7)) - 1];
    for (const pet of a.pets) {
      const outcome = petOutcome(pet);
      const done = (pet.processes ?? []).filter((process) => (pet.processOutcomes?.[process] ?? pet.outcome) === 'Completed');
      for (const t of [total, byProgram.get(a.campaignId), area(a.barangayId)]) {
        if (!t) continue;
        t.attended++;
        if (a.source === 'Walk-in') t.walkIns++;
        t[outcome]++;
        for (const process of done) t.services[process] = (t.services[process] ?? 0) + 1;
      }
      if (month) { month.attended++; if (outcome === 'completed') month.completed++; }
    }
  }
  let interested = 0;
  for (const i of input.interest) { interested += i.pets; area(i.barangayId)!.interested += i.pets; }

  const census = input.registry.length;
  const dogs = input.registry.filter((p) => p.species === 'Dog').length, cats = input.registry.filter((p) => p.species === 'Cat').length;
  const vaccinated = input.registry.filter((p) => p.vaccinated).length;
  const names = new Map(input.barangays.map((b) => [b.id, b.name]));

  const barangays = [...byBarangay.entries()].map(([id, t]) => {
    const r = rates(t);
    const flags = [
      ...(t.registered >= 5 && (r.attendanceRate ?? 100) < 50 ? ['Lower participation'] : []),
      ...(t.noShows >= 5 && t.noShows / Math.max(1, t.registered) >= 0.3 ? ['High no-shows'] : []),
      ...(t.interested >= 10 && t.registered === 0 ? ['Demand not yet served'] : []),
    ];
    return { id, name: names.get(id) ?? `Barangay ${id}`, interested: t.interested, registered: t.registered, attended: t.attended, completed: t.completed, noShows: t.noShows, attendanceRate: r.attendanceRate, completionRate: r.completionRate, interestConversion: pct(t.registered, t.interested), kapon: t.services['Neuter/Spay'], antiRabies: t.services['Anti-Rabies Vaccine'], microchip: t.services.Microchipping, flags };
  }).sort((a, b) => b.attended - a.attended || a.name.localeCompare(b.name));

  const programRows = input.programs.map((p) => {
    const t = byProgram.get(p.id)!, r = rates(t);
    return { id: p.id, title: p.title, date: p.date, status: p.status, barangay: p.hostBarangay, live: p.date === input.today, capacity: p.capacity, registered: t.registered, attended: t.attended, completed: t.completed, deferred: t.deferred, incomplete: t.incomplete + t.notEligible, noShows: t.noShows, notYetScanned: t.notYetScanned, walkIns: t.walkIns, capacityUtilization: r.capacityUtilization, attendanceRate: r.attendanceRate, unusedCapacity: r.unusedCapacity, aboveCapacity: p.capacity !== null && t.attended > p.capacity };
  }).sort((a, b) => b.date.localeCompare(a.date));

  const overview = {
    programs: input.programs.length, capacity: total.capacity, interested, registered: total.registered, attended: total.attended, stubAttended: total.stubAttended, walkIns: total.walkIns,
    completed: total.completed, deferred: total.deferred, notEligible: total.notEligible, incomplete: total.incomplete, noShows: total.noShows, notYetScanned: total.notYetScanned,
    participatingBarangays: new Set(input.attendance.map((a) => a.barangayId)).size, census, dogs, cats, vaccinated,
    ...rates(total),
    interestConversion: pct(total.registered, interested), overallConversion: pct(total.completed, interested), censusInterestRate: pct(interested, census),
    dogShare: pct(dogs, census), catShare: pct(cats, census), vaccinationCoverage: pct(vaccinated, census), sterilizedShare: pct(input.registry.filter((p) => p.sterilized).length, census),
  };
  const services = SERVICES.map((process) => ({ process, completed: total.services[process] }));

  // Reconciliation: each identity must hold; anomalies are listed, never hidden.
  const unscored = input.attendance.reduce((n, a) => n + a.pets.filter((p) => !(p.processes ?? []).length).length, 0);
  const checks = [
    { label: 'Registered = Attended (stub) + No-shows + Not yet scanned', ok: total.registered === total.stubAttended + total.noShows + total.notYetScanned, detail: `${total.registered} = ${total.stubAttended} + ${total.noShows} + ${total.notYetScanned}` },
    { label: 'Attended = Completed + Deferred + Incomplete + Not eligible', ok: total.attended === total.completed + total.deferred + total.incomplete + total.notEligible, detail: `${total.attended} = ${total.completed} + ${total.deferred} + ${total.incomplete} + ${total.notEligible}` },
    { label: 'No program above its capacity', ok: !programRows.some((p) => p.aboveCapacity), detail: programRows.filter((p) => p.aboveCapacity).map((p) => p.title).join(', ') || 'None' },
    { label: 'Every attended pet has a recorded outcome', ok: unscored === 0, detail: unscored ? `${unscored} pet(s) without services` : 'All recorded' },
  ];

  const top = barangays.filter((b) => b.attended).slice(0, 3);
  const insights = [
    overview.capacityUtilization !== null && `${overview.attended} of ${overview.capacity} planned slots were used (${overview.capacityUtilization}% capacity utilization; ${overview.unusedCapacity} unused).`,
    overview.attendanceRate !== null && `${overview.attendanceRate}% of registered pets attended; ${overview.noShows} registered pet(s) did not come.`,
    overview.completionRate !== null && `${overview.completionRate}% of attended pets completed every selected service.`,
    overview.census > 0 && `Recorded pets: ${overview.dogShare}% dogs and ${overview.catShare}% cats; ${overview.vaccinationCoverage}% are recorded as vaccinated.`,
    top.length > 0 && `Top participating barangays: ${top.map((b) => `${b.name} (${b.attended})`).join(', ')}.`,
  ].filter((line): line is string => Boolean(line));

  return { overview, monthly, services, programs: programRows, barangays, checks, insights };
}
export type ProgramKpis = ReturnType<typeof programKpis>;
