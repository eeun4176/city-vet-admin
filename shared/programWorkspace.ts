import type { ProgramProcess } from './programs';

export type ProgramGroup = 'current' | 'upcoming' | 'recent';
export type WorkspaceProgram = {
  id: number; recordId: string; title: string; date: string; location: string;
  startTime: string; endTime: string; status: string; processes: ProgramProcess[];
  hostBarangayId: number | null; hostBarangay: string; campaignId: number | null; campaignStatus: string | null;
  slots: number | null; slotsUsed: number; ownerVisits: number; interestOwners: number; interestPets: number;
  actualStartedAt: string | null; actualFinishedAt: string | null; version: number; group: ProgramGroup;
};
export type WorkspaceList = {
  data: WorkspaceProgram[]; page: number; pageSize: number; total: number;
  counts: Record<ProgramGroup, number>; today: string; serverNow: string;
};
export type WorkspaceDetail = {
  program: WorkspaceProgram; serverNow: string;
  allowedBarangays: { id: number; name: string }[];
  barangayOptions: { id: number; name: string }[];
  assignedParavets: { id: number; name: string; barangay: string }[];
  stock: { batches: number; requested: number; approved: number; available: number; issued: number; redeemed: number; cancelled: number };
  activity: { id: number; actor: string; action: string; reason: string | null; createdAt: string }[];
  scheduleLocked: boolean;
};

export function timingSummary(program: Pick<WorkspaceProgram, 'date' | 'startTime' | 'endTime' | 'actualStartedAt' | 'actualFinishedAt'>, now = Date.now()) {
  const start = Date.parse(`${program.date}T${program.startTime}:00+08:00`);
  const end = Date.parse(`${program.date}T${program.endTime}:00+08:00`);
  const actualStart = program.actualStartedAt ? Date.parse(program.actualStartedAt) : NaN;
  const actualEnd = program.actualFinishedAt ? Date.parse(program.actualFinishedAt) : now;
  return {
    plannedMinutes: Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.round((end - start) / 60000) : null,
    elapsedMinutes: Number.isFinite(actualStart) ? Math.max(0, Math.floor((actualEnd - actualStart) / 60000)) : null,
    overtimeMinutes: Number.isFinite(actualStart) && Number.isFinite(end) ? Math.max(0, Math.floor((actualEnd - end) / 60000)) : null,
  };
}
