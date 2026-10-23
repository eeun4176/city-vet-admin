export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const badRequest = (m: string, d?: unknown) => new AppError(400, 'BAD_REQUEST', m, d);
export const unauthenticated = (m = 'Please sign in.') => new AppError(401, 'UNAUTHENTICATED', m);
export const forbidden = (m = 'You do not have permission to do this.') => new AppError(403, 'FORBIDDEN', m);
export const notFound = (m = 'Not found.') => new AppError(404, 'NOT_FOUND', m);
export const conflict = (code: string, m: string, d?: unknown) => new AppError(409, code, m, d);
export const unprocessable = (code: string, m: string, d?: unknown) => new AppError(422, code, m, d);

const CHECK_RULES: Record<string, { field: string; message: string; expected?: string }> = {
  mobile: { field: 'Mobile number', message: 'Mobile number is incorrect. Use a Philippine mobile number like 0917-123-4567.', expected: '0917-123-4567' },
  contact: { field: 'Contact number', message: 'Contact number is incorrect. Use a Philippine mobile number like 0917-123-4567.', expected: '0917-123-4567' },
  species: { field: 'Species', message: 'Species must be Dog or Cat.', expected: 'Dog or Cat' },
  sex: { field: 'Sex', message: 'Sex must be Male or Female.', expected: 'Male or Female' },
  age_months: { field: 'Age (months)', message: 'Age must be a whole number from 0 to 600 months.', expected: '0–600 months' },
  breed_type: { field: 'Breed type', message: 'Breed type must be Mongrel or Pure.', expected: 'Mongrel or Pure' },
  confinement: { field: 'Confinement', message: 'Choose Confined, Semi-confined, or Free-roaming.', expected: 'Confined, Semi-confined, or Free-roaming' },
  registered_year: { field: 'Registered year', message: 'Registered year must be between 2000 and 2100.', expected: '2000–2100' },
  vaccine_other: { field: 'Other vaccine', message: 'Other vaccine details must be 120 characters or fewer.' },
  remarks: { field: 'Remarks', message: 'Remarks must be 300 characters or fewer.' },
  review_note: { field: 'Review note', message: 'A rejection requires a review note of at least 3 characters.' },
  decision_reason: { field: 'Decision reason', message: 'A rejection requires a reason of at least 3 characters.' },
  census_date: { field: 'Census date', message: 'Census date is invalid. Enter a real date in YYYY-MM-DD format.', expected: 'YYYY-MM-DD' },
};

function checkRule(constraint: string | undefined) {
  if (!constraint) return null;
  const field = Object.keys(CHECK_RULES).find((name) => constraint.endsWith(`_${name}_check`));
  return field ? { name: field, ...CHECK_RULES[field] } : null;
}

/** Translates PostgreSQL errors into safe API errors. Messages raised by our own functions (no constraint name) are user-facing. */
export function fromDb(e: unknown): AppError | null {
  const err = e as { code?: string; message?: string; constraint_name?: string; column_name?: string };
  if (!err || typeof err.code !== 'string') return null;
  const hasConstraint = Boolean(err.constraint_name);
  switch (err.code) {
    case '23505':
      return new AppError(409, 'CONFLICT', 'That record already exists.');
    case '23503':
      return new AppError(422, 'INVALID_REFERENCE', 'A referenced record does not exist or is still in use.');
    case '23502':
      return new AppError(422, 'REQUIRED_FIELD', err.column_name
        ? `${err.column_name.replaceAll('_', ' ')} is required.`
        : 'A required field is missing.', err.column_name ? { field: err.column_name } : undefined);
    case '23514':
    case '22023':
      if (hasConstraint) {
        const rule = checkRule(err.constraint_name);
        if (rule) return new AppError(422, 'RULE_VIOLATION', rule.message, { field: rule.name, label: rule.field, expected: rule.expected });
        const name = err.constraint_name!.replace(/_(check|key)$/i, '').split('_').at(-1);
        const field = name ? name.replaceAll('_', ' ') : 'value';
        return new AppError(422, 'RULE_VIOLATION', `The ${field} field has an invalid value. Check the allowed format or options.`, { field });
      }
      return new AppError(422, 'RULE_VIOLATION', err.message ?? 'Rule violation.');
    case '22P02':
    case '22007':
    case '22008':
      return new AppError(422, 'INVALID_VALUE', 'A value has the wrong format.');
    case '42501':
      return new AppError(403, 'FORBIDDEN', hasConstraint ? 'Not allowed.' : err.message ?? 'Not allowed.');
    default:
      return null;
  }
}
