import type { RegistryPet } from './registry';
import type { ProgramProcess } from './programs';

export type StubOwner = { registryOwnerId?:string; name: string; mobile: string; address: string; barangayId: number };
export type StubPet = Partial<Pick<RegistryPet,'breed'|'breedClass'|'vaccinationStatus'|'sterilizationStatus'|'vaccineType'|'vaccinationDate'|'color'>> & { name: string; species: 'Dog' | 'Cat'; sex?: 'Male' | 'Female'; ageMonths?: number; processes: ProgramProcess[] };
export type ServiceOutcome = 'Completed' | 'Deferred' | 'Not eligible';
export type AttendancePet = StubPet & { outcome: ServiceOutcome; processOutcomes?: Partial<Record<ProgramProcess, ServiceOutcome>> };
export type StubProgram = {
  id: number; title: string; date: string; location: string; hostBarangayId: number; hostBarangay: string;
  status: string; campaignStatus: string; processes: ProgramProcess[]; allowedBarangays: { id: number; name: string }[];
  slots: number | null; slotsUsed: number; durationMinutes: number | null;
  /** HH:MM when the program record has them; printed on the stub. */
  startTime?: string | null; endTime?: string | null;
};
export type StubParavet = { id: number; name: string; barangayId: number; barangay: string };
export type StubBatch = {
  id: number; reference: string; campaignId: number; programTitle: string; programDate: string;
  recipientId: number; recipientName: string; barangayId: number; barangay: string;
  requestedQuantity: number; approvedQuantity: number | null;
  status: 'Requested' | 'Approved' | 'Rejected' | 'Printed' | 'Handed over';
  note: string | null; reviewNote: string | null; createdAt: string; issuedCount: number; redeemedCount: number;
  availableCount?: number; cancelledCount?: number;
  /** When City Vet sent the batch to its barangay to print (Salin lists it). */
  sentAt?: string | null;
};
export type StubTicket = {
  id: number; batchId: number; campaignId: number; code: string; status: 'Available' | 'Issued' | 'Redeemed' | 'Cancelled';
  barangayId?: number;
  owner: StubOwner | null; pets: StubPet[]; issuedAt: string | null; redeemedAt: string | null;
};
export type StubPageData = {
  role: string; assignedBarangayId: number | null; programs: StubProgram[]; paravets: StubParavet[];
  batches: StubBatch[]; page: number; pageSize: number; total: number;
};
export type StubBatchDetails = { batch: StubBatch; program: StubProgram; stubs: StubTicket[]; page: number; pageSize: number; total: number };
export type StubLookup = { stub: StubTicket; program: StubProgram };
export type StubPrintData = { batch: StubBatch; program: StubProgram; stubs: { id: number; code: string; ownerName?:string|null; status?:string; services?: ProgramProcess[]; ownerConfirmedAt?: string | null }[] };
/** A program's stubs for scanning with no signal (Salin downloads it before program day). */
export type StubDayPack = { program: StubProgram; generatedAt: string; stubs: { id: number; code: string; status: StubTicket['status']; owner: StubOwner | null; pets: StubPet[]; redeemedAt: string | null; barangayId: number }[] };
export type ProgramAttendance = {
  id: number; campaignId: number; source: 'Stub' | 'Walk-in'; stubId: number | null; owner: StubOwner;
  pets: AttendancePet[]; attendedOn: string; encodedBy: string; createdAt: string; status: 'Submitted' | 'Voided'; voidReason: string | null;
};
export type AttendancePageData = {
  program: StubProgram; data: ProgramAttendance[]; page: number; pageSize: number; total: number;
  /** owners counts recorded owner visits; names are never treated as proven identities. */
  summary: { owners: number; pets: number; completedServices: number };
};
