import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { visibleRefresh } from '../src/lib/visibleRefresh';
let page: EventTarget & {hidden:boolean}, windowEvents: EventTarget;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(100000);
  page=Object.assign(new EventTarget(),{hidden:false}); windowEvents=new EventTarget();
  vi.stubGlobal('document',page);
  vi.stubGlobal('window',{setInterval,clearInterval,addEventListener:windowEvents.addEventListener.bind(windowEvents),removeEventListener:windowEvents.removeEventListener.bind(windowEvents)});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('visible-only polling',()=>{
  it('refreshes active views every 30 seconds, pauses while hidden, and checks on return',()=>{
    const run=vi.fn(),stop=visibleRefresh(run,30000);
    vi.advanceTimersByTime(29999);expect(run).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(run).toHaveBeenCalledTimes(1);
    page.hidden=true;vi.advanceTimersByTime(90000);expect(run).toHaveBeenCalledTimes(1);
    page.hidden=false;page.dispatchEvent(new Event('visibilitychange'));expect(run).toHaveBeenCalledTimes(2);
    stop();vi.advanceTimersByTime(60000);expect(run).toHaveBeenCalledTimes(2);
  });
  it('does not refresh when inactive or already loading',()=>{
    let enabled=false;const run=vi.fn(),stop=visibleRefresh(run,30000,()=>enabled);
    vi.advanceTimersByTime(60000);expect(run).not.toHaveBeenCalled();enabled=true;windowEvents.dispatchEvent(new Event('focus'));expect(run).toHaveBeenCalledTimes(1);stop();
  });
  it('honors existing server age instead of starting a second 60-second window',()=>{
    let last=45000;const run=vi.fn(()=>{last=Date.now();}),stop=visibleRefresh(run,60000,()=>true,()=>last);
    vi.advanceTimersByTime(4999);expect(run).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(run).toHaveBeenCalledTimes(1);stop();
  });
});
