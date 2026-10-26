import { ChevronsUpDown, Inbox, LogOut, Moon, PanelLeft, Settings, Sun, UserRound } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useT } from '../i18n';
import { useTheme } from '../lib/theme';
import { ConfirmDialog, tabItem, tabList } from './ui';
import { Flyout } from './Flyout';
import type { NavNode } from '../nav/nav';
import { NavRail, NavTree, useOpenGroups } from './NavTree';
import { NavigationBadge } from './NavigationBadge';
import type { NavigationBadges } from '../../shared/navigationBadges';
import { roleLabel } from '../../shared/permissions';

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

// Same look as the e-Vet Field sidebar: a floating card with pill rows.
const accountRow = 'flex h-10 items-center gap-3 rounded-full px-[11px] text-sm font-medium text-slate-500 transition-[background-color,color] duration-300 ease-spring hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-night-muted dark:hover:bg-night-tile dark:hover:text-night-text';
const activeRow = 'bg-brand-500/10 text-slate-900 dark:text-night-text [&>svg]:text-brand-500';
const menuRow = 'menu-item flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none dark:text-night-text dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06]';
const foldButton = 'grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-night-muted dark:hover:bg-night-tile';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

export function Sidebar({ nodes, activeId, activeAncestors, collapsed, onToggleCollapsed, onNavigate,badges,badgeError,refreshBadges }: SidebarProps) {
  const { t } = useT();
  const { account, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, toggleTheme] = useTheme();
  const { open, toggle } = useOpenGroups(activeAncestors);
  const [confirmLogout, setConfirmLogout] = useState(false);
  // Account menu (as in e-Vet Field): appearance and sign out live behind the profile row.
  const [menu, setMenu] = useState(false);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (event: MouseEvent) => { if (!(event.target as Element).closest('[data-account-menu]')) setMenu(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); menuAnchor.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menu]);
  const secondLine = account?.type === 'Paravet' ? (account.barangay ?? account.type) : roleLabel(account?.type ?? '');

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden rounded-[24px] border border-slate-200 bg-white px-[11px] py-4 shadow-sm dark:border-night-border dark:bg-surface-bar">
      <div className={`relative flex h-10 shrink-0 items-center ${collapsed ? 'justify-center' : ''}`}>
        {!collapsed && (
          <div className={`flex min-w-0 flex-1 items-center gap-2.5 pl-1 ${onToggleCollapsed ? 'pr-11' : 'pr-10'}`}>
            <img src="/cityvet-logo.png" alt="" className="h-9 w-9 shrink-0" />
            <div className="flex h-9 min-w-0 flex-col justify-center">
              <p className="flex items-center gap-1.5 text-[18px] font-extrabold leading-5 tracking-[-0.02em] text-slate-900 dark:text-night-text">{t('app.name')}<span className="rounded-md bg-brand-50 px-1.5 text-[10px] font-bold uppercase leading-4 tracking-wide text-brand-700 dark:bg-brand-900 dark:text-brand-300">{t('app.edition')}</span></p>
              <p className="truncate text-[10.5px] font-medium leading-[14px] text-slate-500 dark:text-night-muted">{t('app.city')}</p>
            </div>
          </div>
        )}
        {onToggleCollapsed && (
          <button type="button" onClick={onToggleCollapsed} aria-label={t(collapsed ? 'nav.expand' : 'nav.collapse')} aria-expanded={!collapsed} title={t(collapsed ? 'nav.expand' : 'nav.collapse')}
            className={`${foldButton} ${collapsed ? '' : 'absolute right-0 top-0'}`}>
            {collapsed ? <img src="/cityvet-logo.png" alt="" className="h-9 w-9" /> : <PanelLeft aria-hidden strokeWidth={1.9} className="h-[18px] w-[18px]" />}
          </button>
        )}
      </div>

      <nav aria-label={t('nav.overview')} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-0.5">
        {collapsed ? (
          <NavRail nodes={nodes} activeId={activeId} activeAncestors={activeAncestors} onNavigate={onNavigate} badges={badges}/>
        ) : (
          <NavTree nodes={nodes} open={open} toggle={toggle} activeId={activeId} onNavigate={onNavigate} badges={badges}/>
        )}
      </nav>
      {badgeError&&<button type="button" onClick={refreshBadges} title="Sidebar updates are unavailable. Retry." className="rounded-xl border border-amber-200 p-2 text-xs text-amber-800 dark:border-amber-900 dark:text-amber-200">{collapsed?'!':'Updates unavailable · Retry'}</button>}

      <div className="space-y-1 border-t border-slate-200 pt-3 dark:border-night-border">
        <NavLink to="/inbox" onClick={onNavigate} title={collapsed ? `${t('nav.inbox')}, ${badges.inbox?.pending??0} unread` : undefined} aria-label={`${t('nav.inbox')}, ${badges.inbox?.pending??0} unread`} className={({ isActive }) => `${accountRow} relative ${isActive ? activeRow : ''} ${collapsed ? 'justify-center px-0' : ''}`}>
          <Inbox aria-hidden strokeWidth={1.9} className="h-[18px] w-[18px] shrink-0" />{!collapsed && t('nav.inbox')}<NavigationBadge node={{id:'inbox'}} badges={badges} overlay={collapsed}/>
        </NavLink>
        <NavLink to="/settings" onClick={onNavigate} title={collapsed ? t('nav.settings') : undefined} className={({ isActive }) => `${accountRow} ${isActive ? activeRow : ''} ${collapsed ? 'justify-center px-0' : ''}`}>
          <Settings aria-hidden strokeWidth={1.9} className="h-[18px] w-[18px] shrink-0" />{!collapsed && t('nav.settings')}
        </NavLink>
      </div>

      {confirmLogout && <ConfirmDialog title="Sign out?" message="You will need to sign in again to continue." confirmLabel="Sign out" onClose={() => setConfirmLogout(false)} onConfirm={() => { setConfirmLogout(false); void logout(); }} />}

      {account && (
        <button ref={menuAnchor} type="button" data-account-menu onClick={() => setMenu((open) => !open)} aria-haspopup="menu" aria-expanded={menu} aria-label={`Account: ${account.name}`} title={collapsed ? account.name : undefined}
          className={`flex w-full items-center gap-2.5 rounded-xl p-1 text-left hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-night-tile ${collapsed ? 'justify-center' : ''} ${menu ? 'bg-slate-100 dark:bg-night-tile' : ''}`}>
          {account.profilePhoto
            ? <img src={account.profilePhoto} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
            : <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-300">{initials(account.name)}</span>}
          {!collapsed && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium text-slate-900 dark:text-night-text">{account.name}</span>
              <span className="block truncate text-[11px] text-slate-400">{secondLine}</span>
            </span>
          )}
          {!collapsed && <ChevronsUpDown aria-hidden className="mr-1 h-4 w-4 shrink-0 text-slate-400" />}
        </button>
      )}
      {account && menu && (
        // As in e-Vet Field: name and details on top, then Account, a Light/Dark switch, and Sign out with a note. It opens above the row (beside it when folded).
        <Flyout anchor={menuAnchor} onEnter={() => undefined} onLeave={() => undefined} side={collapsed ? 'right' : 'top'} className="menu-pop w-60 rounded-[14px]">
          <div data-account-menu>
            <div className="menu-item px-2 pb-2 pt-1.5"><p className="truncate text-sm font-semibold text-slate-900 dark:text-night-text">{account.name}</p><p className="truncate text-xs text-slate-500 dark:text-night-muted">{[roleLabel(account.type), account.barangay, account.accountKey ?? account.username].filter(Boolean).join(' · ')}</p></div>
            <button type="button" role="menuitem" style={{ '--i': 1 } as CSSProperties} onClick={() => { setMenu(false); onNavigate?.(); navigate('/account'); }} className={menuRow}>
              <UserRound aria-hidden className="h-4 w-4 text-slate-500" />Account
            </button>
            <div className="menu-item px-2 pb-1.5 pt-1" style={{ '--i': 2 } as CSSProperties}>
              <div role="radiogroup" aria-label={t('settings.appearance')} className={`${tabList} w-full`}>
                {(['light', 'dark'] as const).map((mode) => <button key={mode} type="button" role="radio" aria-checked={theme === mode} onClick={() => { if (theme !== mode) toggleTheme(); }} className={`${tabItem(theme === mode)} h-8 flex-1 px-2 text-[13px]`}>
                  {mode === 'light' ? <Sun aria-hidden className="h-4 w-4" /> : <Moon aria-hidden className="h-4 w-4" />}{t(mode === 'light' ? 'theme.light' : 'theme.dark')}
                </button>)}
              </div>
            </div>
            <div className="my-1 h-px bg-slate-200 dark:bg-night-tile-hover" />
            <button type="button" role="menuitem" style={{ '--i': 3 } as CSSProperties} onClick={() => { setMenu(false); setConfirmLogout(true); }} className={menuRow}>
              <LogOut aria-hidden className="h-4 w-4 text-slate-500" />{t('nav.logout')}
            </button>
            <p className="menu-item px-2 pb-1 text-xs text-slate-500 dark:text-night-muted" style={{ '--i': 4 } as CSSProperties}>You’ll need to sign in again to continue.</p>
          </div>
        </Flyout>
      )}
    </div>
  );
}
