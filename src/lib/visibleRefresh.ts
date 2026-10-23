/** One timer per mounted view; never overlap refreshes or refresh a hidden browser tab. */
export function visibleRefresh(run: () => void, intervalMs: number, enabled: () => boolean = () => true, updatedAt: () => number | null = () => null) {
  const page = (globalThis as unknown as { document: EventTarget & { hidden: boolean } }).document;
  const events = (globalThis as unknown as { window: EventTarget }).window;
  let last = Date.now();
  const check = () => {
    if (page.hidden || !enabled() || Date.now() - (updatedAt() ?? last) < intervalMs) return;
    last = Date.now(); run();
  };
  const timer = setInterval(check, Math.min(intervalMs, 1000));
  page.addEventListener('visibilitychange', check);
  events.addEventListener('focus', check);
  return () => {
    clearInterval(timer);
    page.removeEventListener('visibilitychange', check);
    events.removeEventListener('focus', check);
  };
}
