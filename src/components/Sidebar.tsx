import { ChevronLeft, ChevronRight, Inbox, LogOut, Moon, Settings, Sun } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useT } from '../i18n';
import { useTheme } from '../lib/theme';
import { ConfirmDialog } from './ui';
import type { NavNode } from '../nav/nav';
import { NavRail, NavTree, useOpenGroups } from './NavTree';
import { NavigationBadge } from './NavigationBadge';
import type { NavigationBadges } from '../../shared/navigationBadges';

interface SidebarProps {
  badges:NavigationBadges;
  badgeError?:boolean;
  refreshBadges?:()=>void;
  nodes: NavNode[];
  activeId: string | null;
  activeAncestors: string[];
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}

const label = 'px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400';
const accountRow = 'flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-300 dark:hover:bg-slate-800';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

export function Sidebar({ nodes, activeId, activeAncestors, collapsed, onToggleCollapsed, onNavigate,badges,badgeError,refreshBadges }: SidebarProps) {
  const { t } = useT();
  const { account, logout } = useAuth();
  const [theme, toggleTheme] = useTheme();
  const { open, toggle } = useOpenGroups(activeAncestors);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const secondLine = account?.type === 'Paravet' ? (account.barangay ?? account.type) : account?.type;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel dark:border-slate-800 dark:bg-surface-dark">
      <div className={`flex items-center gap-3 border-b border-slate-100 p-3 dark:border-slate-800 ${collapsed ? 'justify-center' : ''}`}>
        <img src="/images.jpg" alt="" className="h-10 w-10 shrink-0 rounded-xl border border-brand-200 object-cover" />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{t('app.name')}</p>
              <p className="truncate text-xs text-slate-400">{t('app.city')}</p>
            </div>
            {onToggleCollapsed && (
              <button type="button" onClick={onToggleCollapsed} aria-label={t('nav.collapse')}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-slate-800">
                <ChevronLeft aria-hidden className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      <nav aria-label={t('nav.overview')} className="min-h-0 flex-1 overflow-y-auto p-3">
        {!collapsed && <p className={label}>{t('nav.overview')}</p>}
        {collapsed ? (
          <>
            {onToggleCollapsed && (
              <button type="button" onClick={onToggleCollapsed} aria-label={t('nav.expand')}
                className="mx-auto mb-2 flex h-8 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-slate-800">
                <ChevronRight aria-hidden className="h-4 w-4" />
              </button>
            )}
            <NavRail nodes={nodes} activeId={activeId} activeAncestors={activeAncestors} onNavigate={onNavigate} badges={badges}/>
          </>
        ) : (
          <NavTree nodes={nodes} open={open} toggle={toggle} activeId={activeId} onNavigate={onNavigate} badges={badges}/>
        )}
      </nav>
      {badgeError&&<button type="button" onClick={refreshBadges} title="Sidebar updates are unavailable. Retry." className="mx-3 mb-2 rounded-lg border border-amber-200 p-2 text-xs text-amber-800 dark:border-amber-900 dark:text-amber-200">{collapsed?'!':'Updates unavailable · Retry'}</button>}

      <div className="space-y-0.5 border-t border-slate-100 p-3 dark:border-slate-800">
        {!collapsed && <p className={label}>{t('nav.account')}</p>}
        <NavLink to="/inbox" onClick={onNavigate} title={collapsed ? `${t('nav.inbox')}, ${badges.inbox?.pending??0} unread` : undefined} aria-label={`${t('nav.inbox')}, ${badges.inbox?.pending??0} unread`} className={`${accountRow} relative ${collapsed ? 'justify-center' : ''}`}>
          <Inbox aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />{!collapsed && t('nav.inbox')}<NavigationBadge node={{id:'inbox'}} badges={badges} overlay={collapsed}/>
        </NavLink>
        <NavLink to="/settings" onClick={onNavigate} title={collapsed ? t('nav.settings') : undefined} className={`${accountRow} ${collapsed ? 'justify-center' : ''}`}>
          <Settings aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />{!collapsed && t('nav.settings')}
        </NavLink>
        <button type="button" onClick={() => setConfirmLogout(true)} title={collapsed ? t('nav.logout') : undefined} className={`${accountRow} w-full ${collapsed ? 'justify-center' : ''}`}>
          <LogOut aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />{!collapsed && t('nav.logout')}
        </button>
      </div>

      {confirmLogout && <ConfirmDialog title="Sign out?" message="You will need to sign in again to continue." confirmLabel="Sign out" onClose={() => setConfirmLogout(false)} onConfirm={() => { setConfirmLogout(false); void logout(); }} />}

      <div className={`flex items-center gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800 ${collapsed ? 'justify-center px-0' : ''}`}>
        {!collapsed && <Sun aria-hidden className="h-4 w-4 text-slate-400" />}
        <button type="button" role="switch" aria-checked={theme === 'dark'} aria-label={t('theme.toggle')} onClick={toggleTheme}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${theme === 'dark' ? 'bg-brand-600' : 'bg-slate-300'}`}>
          <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${theme === 'dark' ? 'translate-x-4' : ''}`} />
        </button>
        {!collapsed && <Moon aria-hidden className="h-4 w-4 text-slate-400" />}
      </div>

      {account && (
        <div className={`flex items-center gap-3 border-t border-slate-100 p-3 dark:border-slate-800 ${collapsed ? 'justify-center' : ''}`} title={collapsed ? account.name : undefined}>
          {account.profilePhoto
            ? <img src={account.profilePhoto} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            : <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-100">{initials(account.name)}</span>}
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{account.name}</p>
              <p className="truncate text-xs text-slate-400">{secondLine}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
