import { afterEach, describe, expect, it, vi } from 'vitest';
import { invalidateSummaries, readSummary, summaryHeaders } from '../server/summaryCache';
afterEach(() => { invalidateSummaries(); vi.useRealTimers(); });
describe('bounded server summary reuse', () => {
  it('shares concurrent computations and expires at 60 seconds', async () => {
    vi.useFakeTimers(); vi.setSystemTime(100000);
    const load=vi.fn(async()=>({count:5}));
    const result=await Promise.all(Array.from({length:10},()=>readSummary('city',false,load)));
    expect(load).toHaveBeenCalledTimes(1); expect(result[0]).toEqual(result[9]);
    vi.advanceTimersByTime(60000); await readSummary('city',false,load); expect(load).toHaveBeenCalledTimes(2);
  });
  it('separates scopes and lets explicit refresh and successful writes bypass results', async () => {
    const load=vi.fn(async()=>42);
    await readSummary('admin',false,load); await readSummary('paravet:barangay1',false,load);
    await readSummary('admin',true,load); invalidateSummaries(); await readSummary('admin',false,load);
    expect(load).toHaveBeenCalledTimes(4);
  });
  it('keeps results private and reports the age of reused data', async () => {
    vi.useFakeTimers(); vi.setSystemTime(100000);
    const entry=await readSummary('scope',false,async()=>7);
    vi.advanceTimersByTime(55000);
    expect(summaryHeaders(entry)).toMatchObject({'Cache-Control':'no-store','X-Data-Age-Ms':'55000'});
  });
});
