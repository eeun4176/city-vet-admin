import type { IncomingMessage, ServerResponse } from 'node:http';

interface RoutedRequest extends IncomingMessage {
  query?: Record<string, string | string[]>;
  body?: unknown;
  appFeature?: string;
}

type RouteHandler = (req: RoutedRequest, res: ServerResponse) => Promise<void>;

const routeEntries: Array<{ path: string; load: () => Promise<{ default: RouteHandler }>; feature?: string }> = [
  { path: '/api/v1/pet-references', load: () => import('../api-handlers/v1/pet-references') },
  { path: '/api/v1/barangay-assignments', load: () => import('../api-handlers/v1/barangay-assignments') },
  { path: '/api/v1/access/grants/[id]', load: () => import('../api-handlers/v1/access/grants/[id]') },
  { path: '/api/v1/access/grants', load: () => import('../api-handlers/v1/access/grants') },
  { path: '/api/v1/access/requests/[id]/decision', load: () => import('../api-handlers/v1/access/requests/[id]/decision') },
  { path: '/api/v1/access/requests', load: () => import('../api-handlers/v1/access/requests') },
  { path: '/api/v1/activity', load: () => import('../api-handlers/v1/activity'), feature: 'reports' },
  { path: '/api/v1/analytics', load: () => import('../api-handlers/v1/analytics'), feature: 'reports' },
  { path: '/api/v1/program-outcomes', load: () => import('../api-handlers/v1/program-outcomes'), feature: 'reports' },
  { path: '/api/v1/data-quality', load: () => import('../api-handlers/v1/data-quality'), feature: 'data-quality' },
  { path: '/api/v1/registry-workspace', load: () => import('../api-handlers/v1/registry-workspace'), feature: 'registry' },
  { path: '/api/v1/field-records', load: () => import('../api-handlers/v1/field-records'), feature: 'operations' },
  { path: '/api/v1/registry-participant-options', load: () => import('../api-handlers/v1/registry-participant-options'), feature: 'registry' },
  { path: '/api/v1/reports', load: () => import('../api-handlers/v1/reports'), feature: 'reports' },
  { path: '/api/v1/report-workspace', load: () => import('../api-handlers/v1/report-workspace'), feature: 'reports' },
  { path: '/api/v1/report-basket-preview', load: () => import('../api-handlers/v1/report-basket-preview') },
  { path: '/api/v1/spay-neuter-report', load: () => import('../api-handlers/v1/spay-neuter-report'), feature: 'reports' },
  { path: '/api/v1/dashboard/counts', load: () => import('../api-handlers/v1/dashboard/counts') },
  { path: '/api/v1/dashboard/overview', load: () => import('../api-handlers/v1/dashboard/overview') },
  { path: '/api/v1/admin/controls', load: () => import('../api-handlers/v1/admin/controls') },
  { path: '/api/v1/admin/backup', load: () => import('../api-handlers/v1/admin/backup') },
  { path: '/api/v1/health', load: () => import('../api-handlers/v1/health') },
  { path: '/api/v1/issues/[id]', load: () => import('../api-handlers/v1/issues/[id]') },
  { path: '/api/v1/issues', load: () => import('../api-handlers/v1/issues') },
  { path: '/api/v1/notifications', load: () => import('../api-handlers/v1/notifications') },
  { path: '/api/v1/navigation-badges', load: () => import('../api-handlers/v1/navigation-badges') },
  { path: '/api/v1/recently-added', load: () => import('../api-handlers/v1/recently-added') },
  { path: '/api/v1/search', load: () => import('../api-handlers/v1/search') },
  { path: '/api/v1/record-preview', load: () => import('../api-handlers/v1/record-preview') },
  { path: '/api/v1/sample-data', load: () => import('../api-handlers/v1/sample-data') },
  { path: '/api/v1/sample-data/backup', load: () => import('../api-handlers/v1/sample-data-backup') },
  { path: '/api/v1/undo/[token]', load: () => import('../api-handlers/v1/undo') },
  { path: '/api/v1/calendar/events', load: () => import('../api-handlers/v1/calendar/events'), feature: 'operations' },
  { path: '/api/v1/accounts/archive', load: () => import('../api-handlers/v1/accounts/archive'), feature: 'accounts' },
  { path: '/api/v1/accounts', load: () => import('../api-handlers/v1/accounts/index'), feature: 'accounts' },
  { path: '/api/v1/accounts/[key]', load: () => import('../api-handlers/v1/accounts/[key]'), feature: 'accounts' },
  { path: '/api/v1/accounts/[key]/renew-temp-password', load: () => import('../api-handlers/v1/accounts/[key]/renew-temp-password'), feature: 'accounts' },
  { path: '/api/v1/accounts/[key]/reset-password', load: () => import('../api-handlers/v1/accounts/[key]/reset-password'), feature: 'accounts' },
  { path: '/api/v1/auth/first-signin', load: () => import('../api-handlers/v1/auth/first-signin') },
  { path: '/api/v1/auth/login', load: () => import('../api-handlers/v1/auth/login') },
  { path: '/api/v1/auth/logout', load: () => import('../api-handlers/v1/auth/logout') },
  { path: '/api/v1/auth/me', load: () => import('../api-handlers/v1/auth/me') },
  { path: '/api/v1/auth/preferences', load: () => import('../api-handlers/v1/auth/preferences') },
  { path: '/api/v1/auth/photo', load: () => import('../api-handlers/v1/auth/photo') },
  { path: '/api/v1/auth/profile', load: () => import('../api-handlers/v1/auth/profile') },
  { path: '/api/v1/auth/renew', load: () => import('../api-handlers/v1/auth/renew') },
  { path: '/api/v1/auth/set-password', load: () => import('../api-handlers/v1/auth/set-password') },
  { path: '/api/v1/auth/email', load: () => import('../api-handlers/v1/auth/email') },
  { path: '/api/v1/auth/forgot-password', load: () => import('../api-handlers/v1/auth/forgot-password') },
  { path: '/api/v1/barangays', load: () => import('../api-handlers/v1/barangays/index') },
  { path: '/api/v1/cron/maintenance', load: () => import('../api-handlers/v1/cron/maintenance') },
  { path: '/api/v1/census/front-page', load: () => import('../api-handlers/v1/census/front-page'), feature: 'census' },
  { path: '/api/v1/census/summary', load: () => import('../api-handlers/v1/census/summary'), feature: 'census' },
  { path: '/api/v1/census/submissions/[id]/attachments/[attachmentId]', load: () => import('../api-handlers/v1/census/submissions/[id]/attachments/[attachmentId]'), feature: 'census' },
  { path: '/api/v1/census/submissions/[id]/attachments', load: () => import('../api-handlers/v1/census/submissions/[id]/attachments'), feature: 'census' },
  { path: '/api/v1/census/submissions/[id]/decisions', load: () => import('../api-handlers/v1/census/submissions/[id]/decisions'), feature: 'census' },
  { path: '/api/v1/census/submissions/[id]/resubmit', load: () => import('../api-handlers/v1/census/submissions/[id]/resubmit'), feature: 'census' },
  { path: '/api/v1/census/submissions/[id]/review', load: () => import('../api-handlers/v1/census/submissions/[id]/review'), feature: 'census' },
  { path: '/api/v1/census/submissions/[id]/status', load: () => import('../api-handlers/v1/census/submissions/[id]/status'), feature: 'census' },
  { path: '/api/v1/census/submissions/[id]', load: () => import('../api-handlers/v1/census/submissions/[id]'), feature: 'census' },
  { path: '/api/v1/census/submissions', load: () => import('../api-handlers/v1/census/submissions'), feature: 'census' },
  { path: '/api/v1/prelistings', load: () => import('../api-handlers/v1/prelistings/index'), feature: 'operations' },
  { path: '/api/v1/program-interest', load: () => import('../api-handlers/v1/program-interest/index'), feature: 'operations' },
  { path: '/api/v1/stub-workflow', load: () => import('../api-handlers/v1/stub-workflow/index'), feature: 'operations' },
  { path: '/api/v1/program-workspace', load: () => import('../api-handlers/v1/program-workspace/index'), feature: 'operations' },
  { path: '/api/v1/records/[dataset]', load: () => import('../api-handlers/v1/records/[dataset]') },
  { path: '/api/v1/records/[dataset]/archive', load: () => import('../api-handlers/v1/records/[dataset]/archive') },
  { path: '/api/v1/records/[dataset]/import', load: () => import('../api-handlers/v1/records/[dataset]/import') },
  { path: '/api/v1/records/[dataset]/undo-import', load: () => import('../api-handlers/v1/records/[dataset]/undo-import') },
];

const routes = routeEntries.map((entry) => {
  const names: string[] = [];
  const expression = `^${entry.path.replace(/\[([^\]]+)\]/g, (_match, name: string) => {
    names.push(name);
    return '([^/]+)';
  })}$`;
  return { ...entry, names, expression: new RegExp(expression) };
}).sort((a, b) => a.names.length - b.names.length);

export async function dispatchApi(req: RoutedRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const rewrittenPath = url.searchParams.get('route') ?? req.query?.route;
  const requestPath = Array.isArray(rewrittenPath) ? rewrittenPath[0] : rewrittenPath;
  const pathname = typeof requestPath === 'string' && requestPath.startsWith('/api/v1/')
    ? requestPath
    : url.pathname;
  for (const route of routes) {
    const match = route.expression.exec(pathname);
    if (!match) continue;
    const query = { ...(req.query ?? {}) };
    route.names.forEach((name, index) => {
      query[name] = decodeURIComponent(match[index + 1]);
    });
    req.query = query;
    const dataset = String(query.dataset ?? '');
    req.appFeature = route.feature ?? (
      route.path.startsWith('/api/v1/records/')
        ? route.path.endsWith('/import') || route.path.endsWith('/undo-import')
          ? 'data-management'
          : ['programs', 'participants', 'respondents', 'households', 'animals'].includes(dataset)
            ? 'operations'
            : dataset === 'paravets' ? 'field-team' : 'registry'
        : undefined
    );
    try {
      const { default: handler } = await route.load();
      return await handler(req, res);
    } catch {
      console.error(JSON.stringify({ event: 'api_module_load_failed', path: route.path }));
      res.statusCode = 503;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json');
      res.end('{"error":{"code":"TEMPORARILY_UNAVAILABLE","message":"This feature could not be loaded. Please try again."}}');
      return;
    }
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end('{"error":{"code":"NOT_FOUND","message":"Not found."}}');
}
