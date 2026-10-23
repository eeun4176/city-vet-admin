import { describe, expect, it } from 'vitest';
import { databaseStatus } from '../src/lib/databaseStatus';

describe('database status dot', () => {
  it('shows offline without a network, whatever the last health check said', () => {
    for (const health of ['checking', 'connected', 'failed'] as const) expect(databaseStatus(false, health)).toBe('offline');
  });
  it('maps the health check to loading, active or error while online', () => {
    expect(databaseStatus(true, 'checking')).toBe('loading');
    expect(databaseStatus(true, 'connected')).toBe('active');
    expect(databaseStatus(true, 'failed')).toBe('error');
  });
});
