import type { ProgramProcess } from './programs';
export type FieldKind = 'respondents' | 'participants' | 'services';
export type FieldView = 'primary' | 'standalone' | 'history';
export const SERVICE_OUTCOMES = ['Completed', 'Deferred', 'Not eligible'] as const;
export type ServiceOutcome = typeof SERVICE_OUTCOMES[number];
export interface StandaloneDraft {
  requestId: string; ownerId: string; servedOn: string; location: string; provider: string; note: string;
  pets: { petId: string; procedures: { process: ProgramProcess; outcome: ServiceOutcome }[] }[];
}
export interface FieldRow extends Record<string, unknown> {
  id: string; name: string; source: string; date: string; barangay: string; status: string;
  submissionId?: string; campaignId?: number; programId?: number; attendanceId?: number; ownerId?: string;
  process?: string; petName?: string; petCount?: number; entryStatus?: string; _archived?: boolean;
}
export interface FieldPage { data: FieldRow[]; page: number; pageSize: number; total: number }
export interface StandaloneReview {
  token: string; owner: Record<string, unknown>; pets: Record<string, unknown>[];
  duplicates: { id: string; date: string; provider: string }[];
}
export function fieldRecordLink(kind:string,id:string,data:Record<string,unknown>) {
 const path=kind==='services'?'/services':`/registry/${kind}`;
 const standalone=data.workflow==='standalone-services-v1';
 const target=standalone?String(data.visitId):id;
 const view=standalone?'standalone':data.workflow==='qr-stubs-v1'||id.startsWith('CENSUSRESP-')?'primary':'history';
 return `${path}?view=${view}&recordId=${encodeURIComponent(target)}`;
}
