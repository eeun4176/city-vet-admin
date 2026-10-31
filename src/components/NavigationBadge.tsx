import { descendantBadge,pendingLabel,type NavigationBadges } from '../../shared/navigationBadges';
import type { NavNode } from '../nav/nav';
export function navigationBadgeText(node:NavNode,badges:NavigationBadges){
 const badge=badges[node.id];
 if(node.children?.length)return descendantBadge(node.children,badges)?'Updates or pending work in this category':'';
 return [badge?.pending?pendingLabel(node.id,badge.pending):'',badge?.updated?'New updates from other staff':''].filter(Boolean).join('. ');
}
export function NavigationBadge({node,badges,overlay=false}:{node:Pick<NavNode,'id'|'children'>;badges:NavigationBadges;overlay?:boolean}){
 const parent=!!node.children?.length,badge=badges[node.id];
 const pending=parent?0:badge?.pending??0,updated=parent?descendantBadge(node.children!,badges):badge?.updated;
 if(!pending&&!updated)return null;
 const description=parent?'Updates or pending work in this category':[pending?pendingLabel(node.id,pending):'',updated?'New updates from other staff':''].filter(Boolean).join('. ');
 return <span role="img" aria-label={description} title={description} className={`${overlay?'absolute -right-1 -top-1':'ml-auto'} inline-flex shrink-0 items-center gap-1.5`}>
  {pending>0&&<span aria-hidden className="min-w-5 rounded-full bg-amber-50 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-4 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">{pending>99?'99+':pending}</span>}
  {updated&&(!overlay||!pending)&&<span aria-hidden className="h-2 w-2 rounded-full bg-brand-600 ring-2 ring-white dark:bg-brand-400 dark:ring-surface-dark"/>}
 </span>;
}
