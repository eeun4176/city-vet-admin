export const PROGRAM_PROCESSES = ['Microchipping', 'Anti-Rabies Vaccine', 'Neuter/Spay'] as const;
export type ProgramProcess = (typeof PROGRAM_PROCESSES)[number];

export const PROGRAM_STATUSES = ['Planned', 'Open', 'In progress', 'Completed', 'Postponed', 'Cancelled'] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

const LEGACY_PROGRAM_STATUS: Record<string, ProgramStatus> = {
  scheduled: 'Planned',
  approved: 'Open',
  active: 'In progress',
  draft: 'Planned',
  'pending approval': 'Planned',
};

export function normalizeProgramStatus(value: string): ProgramStatus | null {
  const canonical = PROGRAM_STATUSES.find((status) => status.toLowerCase() === value.trim().toLowerCase());
  return canonical ?? LEGACY_PROGRAM_STATUS[value.trim().toLowerCase()] ?? null;
}

export function programProcessesFrom(value: unknown, legacyValue?: unknown): ProgramProcess[] {
  const allowed = new Set<string>(PROGRAM_PROCESSES);
  if (Array.isArray(value)) {
    const selected = [...new Set(value.filter((process): process is ProgramProcess => typeof process === 'string' && allowed.has(process)))];
    if (selected.length) return selected;
  }
  const legacy = String(legacyValue ?? value ?? '').trim().toLowerCase();
  if (!legacy) return [];
  if (legacy.includes('all')) return [...PROGRAM_PROCESSES];
  const processes: ProgramProcess[] = [];
  if (legacy.includes('kapon') || legacy.includes('neuter') || legacy.includes('spay')) processes.push('Neuter/Spay');
  if (legacy.includes('rabies')) processes.push('Anti-Rabies Vaccine');
  if (legacy.includes('microchip')) processes.push('Microchipping');
  return [...new Set(processes)];
}
