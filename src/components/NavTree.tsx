import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { NavLink } from 'react-router-dom';
import { useT } from '../i18n';
import type { NavNode } from '../nav/nav';
import { Flyout } from './Flyout';
import { NavigationBadge,navigationBadgeText } from './NavigationBadge';
import type { NavigationBadges } from '../../shared/navigationBadges';

const STORAGE_KEY = 'cv.nav.open';
const rowBase = 'flex h-10 w-full items-center gap-3 rounded-full px-[11px] text-left text-sm font-medium transition-[background-color,color] duration-300 ease-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';
const childRow = 'flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-[background-color,color] duration-300 ease-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';
const idle = 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-night-muted dark:hover:bg-night-tile dark:hover:text-night-text';
const current = 'bg-brand-500/10 font-medium text-slate-900 dark:text-night-text';

export function useOpenGroups(activeAncestors: string[]) {
  const [open, setOpen] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[]); } catch { return new Set(); }
  });
  const key = activeAncestors.join('|');
  useEffect(() => {
    if (!activeAncestors.length) return;
    setOpen((prev) => (activeAncestors.every((id) => prev.has(id)) ? prev : new Set([...prev, ...activeAncestors])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);
  return { open, toggle };
}

interface TreeProps {
  badges:NavigationBadges;
  nodes: NavNode[];
  open: Set<string>;
  toggle: (id: string) => void;
  activeId: string | null;
  onNavigate?: () => void;
  level?: number;
}

/** Expanded sidebar: top-level rows have an icon, and groups a chevron on the right that turns when they open; children sit on a guide line, without icons, and stagger in. */
export function NavTree({ nodes, open, toggle, activeId, onNavigate, level = 0,badges }: TreeProps) {
  const { t } = useT();
  return (
    <ul role={level === 0 ? 'tree' : 'group'} className={level === 0 ? 'space-y-1' : `${level === 1 ? 'ml-5' : 'ml-3'} mt-1 space-y-0.5 border-l border-slate-200 pl-2.5 dark:border-night-border`}>
      {nodes.map((node, index) => {
        const Icon = node.icon;
        const hasChildren = Boolean(node.children?.length);
        const expanded = open.has(node.id);
        const row = level === 0 ? rowBase : childRow;
        const chevron = hasChildren && <ChevronRight aria-hidden className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ease-spring ${expanded ? 'rotate-90' : ''}`} />;
        const icon = Icon && level === 0 ? <Icon aria-hidden strokeWidth={1.9} className={`h-[18px] w-[18px] shrink-0 ${node.id === activeId ? 'text-brand-500' : ''}`} /> : null;
        return (
          <li key={node.id} role="treeitem" aria-expanded={hasChildren ? expanded : undefined} aria-selected={node.id === activeId} className={level ? 'nav-stagger' : undefined} style={level ? { '--i': index } as CSSProperties : undefined}>
            {hasChildren ? (
              <button type="button" onClick={() => toggle(node.id)} className={`${row} ${idle} ${expanded ? 'text-slate-900 dark:text-night-text' : ''}`}>
                {icon}<span className="min-w-0 flex-1 truncate">{t(node.label)}</span><NavigationBadge node={node} badges={badges}/>{chevron}
              </button>
            ) : (
              <NavLink to={node.to ?? '#'} onClick={onNavigate} aria-current={node.id === activeId ? 'page' : undefined}
                className={`${row} ${node.id === activeId ? current : idle}`}>
                {icon}<span className="min-w-0 flex-1 truncate">{t(node.label)}</span><NavigationBadge node={node} badges={badges}/>
              </NavLink>
            )}
            {hasChildren && expanded && (
              <NavTree nodes={node.children!} open={open} toggle={toggle} activeId={activeId} onNavigate={onNavigate} level={level + 1} badges={badges}/>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FlyoutLinks({ nodes, activeId, onNavigate, level = 0,badges }: { nodes: NavNode[]; activeId: string | null; onNavigate?: () => void; level?: number;badges:NavigationBadges }) {
  const { t } = useT();
  return (
    <>
      {nodes.map((node) => node.children?.length ? (
        <div key={node.id}>
          <p style={{ paddingLeft: 10 + level * 12 }} className="flex items-center gap-2 px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t(node.label)}<NavigationBadge node={node} badges={badges}/></p>
          <FlyoutLinks nodes={node.children} activeId={activeId} onNavigate={onNavigate} level={level + 1} badges={badges}/>
        </div>
      ) : (
        <NavLink key={node.id} to={node.to ?? '#'} role="menuitem" onClick={onNavigate} style={{ paddingLeft: 10 + level * 12 }}
          className={`flex items-center gap-2 rounded-lg py-2 pr-3 text-sm ${node.id === activeId ? current : idle}`}>
          {t(node.label)}<NavigationBadge node={node} badges={badges}/>
        </NavLink>
      ))}
    </>
  );
}

/** Collapsed sidebar: icon only. Groups open a Portal flyout on hover, focus or click; links show a label tooltip. */
export function NavRail({ nodes, activeId, activeAncestors, onNavigate,badges }: { nodes: NavNode[]; activeId: string | null; activeAncestors: string[]; onNavigate?: () => void;badges:NavigationBadges }) {
  return (
    <ul className="space-y-1">
      {nodes.map((node) => <RailItem key={node.id} node={node} activeId={activeId} isAncestor={activeAncestors.includes(node.id)} onNavigate={onNavigate} badges={badges}/>)}
    </ul>
  );
}

function RailItem({ node, activeId, isAncestor, onNavigate,badges }: { node: NavNode; activeId: string | null; isAncestor: boolean; onNavigate?: () => void;badges:NavigationBadges }) {
  const { t } = useT();
  const anchor = useRef<HTMLElement | null>(null);
  const timer = useRef<number>();
  const [shown, setShown] = useState(false);
  const Icon = node.icon;
  const hasChildren = Boolean(node.children?.length);
  const active = node.id === activeId || isAncestor;
  const show = () => { window.clearTimeout(timer.current); setShown(true); };
  const hide = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setShown(false), 120); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setShown(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shown]);
  const classes = `relative flex h-10 w-10 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${active ? current : idle}`;
  const common = { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide, 'aria-label': [t(node.label),navigationBadgeText(node,badges)].filter(Boolean).join('. ') };
  return (
    <li className="flex justify-center">
      {hasChildren ? (
        <button type="button" ref={(el) => { anchor.current = el; }} className={classes} aria-haspopup="menu" aria-expanded={shown}
          onClick={show} {...common}>
          {Icon && <Icon aria-hidden className="h-[18px] w-[18px]" />}
          <NavigationBadge node={node} badges={badges} overlay/>
        </button>
      ) : (
        <NavLink to={node.to ?? '#'} ref={(el) => { anchor.current = el; }} className={classes} onClick={onNavigate} {...common}>
          {Icon && <Icon aria-hidden className="h-[18px] w-[18px]" />}
          <NavigationBadge node={node} badges={badges} overlay/>
        </NavLink>
      )}
      {shown && (hasChildren ? (
        <Flyout anchor={anchor} onEnter={show} onLeave={hide}>
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-slate-700 dark:text-night-text">{t(node.label)}</p>
          <FlyoutLinks nodes={node.children!} activeId={activeId} onNavigate={() => { setShown(false); onNavigate?.(); }} badges={badges}/>
        </Flyout>
      ) : (
        <Flyout anchor={anchor} onEnter={show} onLeave={hide} role="tooltip">
          <p className="whitespace-nowrap px-2.5 py-1.5">{t(node.label)}{navigationBadgeText(node,badges)&&<span className="block text-xs">{navigationBadgeText(node,badges)}</span>}</p>
        </Flyout>
      ))}
    </li>
  );
}
