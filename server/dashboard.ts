import { z } from 'zod';
import { notFound, unprocessable } from './errors';
import { PH_MOBILE_MESSAGE } from './phone';
import { normalizeProgramStatus, programProcessesFrom } from '../shared/programs';

export const DATASETS = [
  'owners', 'pets', 'paravets', 'respondents', 'households',
  'animals', 'stubs', 'services', 'programs', 'participants',
] as const;

export type Dataset = (typeof DATASETS)[number];
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value === 'object') return Object.values(value).every(isJsonValue);
  return false;
}

export function jsonValue(value: unknown): JsonValue {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw unprocessable('INVALID_RECORD_DATA', 'Record data must be valid JSON.');
  const decoded: unknown = JSON.parse(encoded);
  if (!isJsonValue(decoded)) throw unprocessable('INVALID_RECORD_DATA', 'Record data must be valid JSON.');
  return decoded;
}

export function normalizeRecordInputs(record: Record<string, unknown>, kind?: Dataset): Record<string, unknown> {
  const normalized = { ...record };
  delete normalized._attendanceSlotsUsed;
  delete normalized._relationshipIssue;
  delete normalized._archived;
  for (const [field, value] of Object.entries(normalized)) {
    if (typeof value !== 'string' || value.trim() === '') continue;
    if (/^(mobile|contact|phone|telephone)$/i.test(field)) {
      const digits = value.replace(/\D/g, '');
      if (!/^09\d{9}$/.test(digits)) {
        const label = field.toLowerCase() === 'contact' ? 'Contact number' : 'Mobile number';
        throw unprocessable('INVALID_MOBILE', `${label} is incorrect. ${PH_MOBILE_MESSAGE}`, { field, expected: '09171234567' });
      }
      normalized[field] = digits;
      continue;
    }
    const actualServiceDate = kind === 'services' && /^(date|service_?date|served_?on|visit_?date)$/i.test(field);
    if ((/date/i.test(field) && !/^(createdAt|updatedAt|created_at|updated_at)$/i.test(field)) || actualServiceDate) {
      const datePart = value.match(/^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/)?.[1];
      const date = datePart ? new Date(`${datePart}T00:00:00.000Z`) : null;
      if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== datePart || (value.includes('T') && Number.isNaN(Date.parse(value)))) {
        throw unprocessable('INVALID_DATE', `${field.replaceAll('_', ' ')} must be a real date in YYYY-MM-DD format.`, { field, expected: 'YYYY-MM-DD' });
      }
      if (actualServiceDate && datePart! > new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })) {
        throw unprocessable('SERVICE_DATE_IN_FUTURE', 'Actual service dates cannot be in the future.', { field });
      }
    }
  }
  if (kind === 'programs') {
    if (normalized.slots === null || normalized.slots === '') delete normalized.slots;
    else if (normalized.slots !== undefined) {
      const slots = Number(normalized.slots);
      if (!Number.isInteger(slots) || slots < 1 || slots > 100000) throw unprocessable('INVALID_PROGRAM_CAPACITY', 'Enter a pet slot capacity from 1 to 100,000, or leave it blank.', { field: 'slots' });
      normalized.slots = slots;
    }
    const status = normalizeProgramStatus(String(normalized.status ?? 'Planned'));
    if (!status) throw unprocessable('INVALID_PROGRAM_STATUS', 'Choose Planned, Open, In progress, Completed, Postponed, or Cancelled.', { field: 'status' });
    normalized.status = status;
    const processes = programProcessesFrom(normalized.processes, normalized.program);
    if (!processes.length) throw unprocessable('PROGRAM_PROCESS_REQUIRED', 'Select at least one program process using the process checkboxes.', { field: 'processes' });
    normalized.processes = processes;
    const activeSchedule = ['Planned', 'Open', 'In progress'].includes(status);
    const programDate = String(normalized.date ?? normalized.programDate ?? '').slice(0, 10);
    if (activeSchedule && !programDate) throw unprocessable('PROGRAM_DATE_REQUIRED', 'Add the date for a planned program.', { field: 'date' });
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    if (activeSchedule && programDate < today) throw unprocessable('PROGRAM_DATE_IN_PAST', 'A planned program must be today or a future date.', { field: 'date' });

    const startTime = String(normalized.startTime ?? '').trim();
    const endTime = String(normalized.endTime ?? '').trim();
    if (Boolean(startTime) !== Boolean(endTime)) throw unprocessable('PROGRAM_TIME_PAIR_REQUIRED', 'Enter both a start and end time, or leave both blank.', { field: startTime ? 'endTime' : 'startTime' });
    if (startTime || endTime) {
      const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      if (!timePattern.test(startTime) || !timePattern.test(endTime)) throw unprocessable('INVALID_PROGRAM_TIME', 'Enter start and end times in 24-hour format.', { field: 'startTime' });
      const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
      const duration = toMinutes(endTime) - toMinutes(startTime);
      if (duration < 1) throw unprocessable('INVALID_PROGRAM_DURATION', 'The end time must be later than the start time.', { field: 'endTime' });
      normalized.durationMinutes = duration;
    } else delete normalized.durationMinutes;
  }
  return normalized;
}

export function dataset(value: string): Dataset {
  if ((DATASETS as readonly string[]).includes(value)) return value as Dataset;
  throw notFound('Dashboard dataset not found.');
}

export const record = z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
  if (typeof value.id !== 'string' && typeof value.id !== 'number') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Each record needs a string or numeric id.', path: ['id'] });
  } else if (typeof value.id === 'string' && (!value.id.trim() || value.id.length > 100)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Record ids must contain 1 to 100 non-blank characters.', path: ['id'] });
  } else if (typeof value.id === 'number' && (!Number.isInteger(value.id) || value.id < 1)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Numeric record ids must be positive integers.', path: ['id'] });
  }
});

export const recordBatch = z.object({ records: z.array(record).min(1).max(100) });
export const archiveBatch = z.object({
  ids: z.array(z.union([z.string().min(1).max(100), z.number().int().positive()])).min(1).max(500),
  archived: z.boolean(),
});
