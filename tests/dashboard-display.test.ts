/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState, LoadError, Loading, Spinner } from '../src/components/ui';
import { LocaleProvider } from '../src/i18n';
import { dashboardShortcutIds } from '../shared/dashboardOverview';
import { NAV, flatten, filterNav } from '../src/nav/nav';
import { can, type Role } from '../shared/permissions';

describe('dashboard and shared feedback', () => {
  it('offers at most six role-specific shortcuts intersected with permitted navigation', () => {
    for (const role of ['Admin', 'SuperAdmin', 'Paravet'] as Role[]) {
      const permitted = flatten(filterNav(NAV.flatMap(s => s.nodes), n => !n.cap || can({ role }, n.cap))).map(t => t.node.id);
      const ids = dashboardShortcutIds(role).filter(id => permitted.includes(id));
      expect(ids).toHaveLength(6); expect(new Set(ids).size).toBe(6);
      if (role === 'Paravet') { expect(ids).toContain('census-submit'); expect(ids).not.toContain('services'); }
      else { expect(ids).toContain('census-pending'); expect(ids).not.toContain('census-submit'); }
    }
  });
  it('renders explicit empty and retry states without presenting a failed read as zero', () => {
    const empty = renderToStaticMarkup(createElement(EmptyState, { title: 'No pending tasks', description: 'Within these queues.' }));
    expect(empty).toContain('No pending tasks'); expect(empty).toContain('Within these queues.');
    const error = renderToStaticMarkup(createElement(LoadError, { message: 'Connection unavailable', onRetry: () => {} }));
    expect(error).toContain('role="alert"'); expect(error).toContain('Try again'); expect(error).not.toContain('No pending tasks');
  });
  it('shows a loading skeleton, keeps the label for screen readers, and announces work as status', () => {
    const loading = renderToStaticMarkup(createElement(LocaleProvider, { children: createElement<{ label?: string }>(Loading, { label: 'Loading pending work…' }) }));
    expect(loading).toContain('role="status"'); expect(loading).toContain('animate-pulse'); expect(loading).toContain('Loading pending work…');
    const saving = renderToStaticMarkup(createElement(Spinner, { label: 'Saving…' }));
    expect(saving).toContain('aria-hidden="true"'); expect(saving).toContain('Saving…');
  });
});

describe('dashboard date', () => {
  it('reads like "Monday, Apr 17 2026" in Manila time', async () => {
    const { todayLabel } = await import('../src/pages/DashboardPage');
    expect(todayLabel(new Date('2026-04-17T02:00:00Z'))).toBe('Friday, Apr 17 2026');
    expect(todayLabel(new Date('2026-04-19T17:00:00Z'))).toBe('Monday, Apr 20 2026');
  });
});
