import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Bell, ExternalLink, Mail, MailOpen } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { Loading, Modal, Notice, btnGhost, btnPrimary, tabItem, tabList } from '../components/ui';

type View = 'unread' | 'read' | 'archived';
type Notification = { id: number; kind: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null; archived_at: string | null };
type Inbox = { data: Notification[]; unread: number; counts: { unread: number; read: number; archived: number }; view: string };
const tabs: { key: View; label: string }[] = [
  { key: 'unread', label: 'Unread' }, { key: 'read', label: 'Read' }, { key: 'archived', label: 'Archived' },
];

export function InboxPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('unread');
  const [selected, setSelected] = useState<Notification | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [actionError, setActionError] = useState('');
  const { data, error, loading, reload } = useApi<Inbox>(`/notifications?view=${view}`);

  const changeView = (next: View) => { setSelected(null); setView(next); };
  const update = async (action: 'read' | 'archive' | 'restore', item: Notification) => {
    setActionError('');
    setBusyId(item.id);
    try {
      await api('PATCH', '/notifications', { action, id: item.id });
      if (action === 'archive' || action === 'restore') setSelected(null);
      reload();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not update this notification.');
    } finally {
      setBusyId(null);
    }
  };
  const openMessage = async (item: Notification) => {
    setSelected(item);
    if (item.read_at || item.archived_at) return;
    try {
      await api('PATCH', '/notifications', { action: 'read', id: item.id });
      reload();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not mark this message as read.');
    }
  };
  const markAllRead = async () => {
    setActionError('');
    setBusyAll(true);
    try {
      await api('PATCH', '/notifications', { action: 'read-all' });
      reload();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not mark notifications as read.');
    } finally {
      setBusyAll(false);
    }
  };
  const followLink = (item: Notification) => {
    const destination = item.link;
    if (!destination || !destination.startsWith('/') || destination.startsWith('//')) return;
    setSelected(null);
    navigate(destination);
  };

  return <div className="w-full">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Notifications</h1><p className="mt-1 text-sm text-slate-500">{data?.counts.unread ?? 0} unread · {data?.counts.read ?? 0} read</p></div>
      <button type="button" onClick={() => void markAllRead()} disabled={!data?.counts.unread || busyAll} className={btnGhost}>
        {busyAll ? 'Marking…' : 'Mark all read'}
      </button>
    </div>
    <div role="tablist" aria-label="Notification inbox" className={`${tabList} mt-5 w-full`}>
      {tabs.map((tab) => <button key={tab.key} role="tab" type="button" aria-selected={view === tab.key} onClick={() => changeView(tab.key)}
        className={tabItem(view === tab.key)}>
        {tab.label}<span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-xs tabular-nums">{data?.counts[tab.key] ?? 0}</span>
      </button>)}
    </div>
    {error && <div className="mt-4"><Notice kind="error">{error.message}</Notice></div>}
    {actionError && <div className="mt-4"><Notice kind="error">{actionError}</Notice></div>}
    {loading ? <Loading /> : <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-night-border dark:border-night-border">
      {!data?.data.length ? <div className="p-8 text-center text-sm text-slate-500"><Bell aria-hidden className="mx-auto mb-2 h-5 w-5" />No {view} notifications.</div> : data.data.map((item) => <article key={item.id} className={`flex items-center gap-3 p-4 ${!item.read_at && !item.archived_at ? 'bg-brand-50/50 dark:bg-brand-900/10' : ''}`}>
        <span aria-hidden className="text-slate-400">{item.read_at ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}</span>
        <button type="button" onClick={() => void openMessage(item)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <span className="block truncate text-sm font-semibold">{item.title}</span>
          <span className="mt-1 block truncate text-sm text-slate-600 dark:text-night-muted">{item.body || 'Open to review this notification.'}</span>
          <span className="mt-2 block text-xs text-slate-400">{item.kind} · {new Date(item.created_at).toLocaleString()}</span>
        </button>
        {view === 'archived'
          ? <button type="button" disabled={busyId === item.id} onClick={() => void update('restore', item)} aria-label={`Restore ${item.title}`} title="Restore notification" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-night-tile"><ArchiveRestore aria-hidden className="h-4 w-4" /></button>
          : <button type="button" disabled={busyId === item.id} onClick={() => void update('archive', item)} aria-label={`Archive ${item.title}`} title="Archive notification" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-night-tile"><Archive aria-hidden className="h-4 w-4" /></button>}
      </article>)}
    </div>}
    {selected && <Modal title={selected.title} onClose={() => setSelected(null)}>
      <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-night-text">{selected.body || 'There are no additional details for this notification.'}</p>
      <p className="mt-3 text-xs text-slate-500">{selected.kind} · {new Date(selected.created_at).toLocaleString()}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => void update('archive', selected)} disabled={busyId === selected.id} className={btnGhost}><Archive aria-hidden className="h-4 w-4" />Archive</button>
        {selected.link && selected.link.startsWith('/') && !selected.link.startsWith('//') && <button type="button" onClick={() => followLink(selected)} className={btnPrimary}>Open related page<ExternalLink aria-hidden className="h-4 w-4" /></button>}
      </div>
    </Modal>}
  </div>;
}
