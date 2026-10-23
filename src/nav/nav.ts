import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight, BarChart3, Bug, CalendarDays, ClipboardCheck, ClipboardList, Database, FileText, Folder,
  KeyRound, LayoutDashboard, MapPin, PawPrint, ScrollText, ShieldCheck, Stethoscope, Ticket, UserCog, Users,
} from 'lucide-react';
import type { Capability } from '../../shared/permissions';
import type { MessageKey } from '../i18n/messages';

export interface NavNode {
  id: string;
  label: MessageKey;
  icon?: LucideIcon;
  /** Real URL. Groups have no `to`. */
  to?: string;
  /** Shown only when the person has this capability. */
  cap?: Capability;
  /** SuperAdmin feature switch that can hide the section for Admin and Paravet. */
  feature?: string;
  children?: NavNode[];
}

export interface NavSection { id: string; label: MessageKey; nodes: NavNode[] }

/** Up to four levels deep. Groups with no visible children disappear. */
export const NAV: NavSection[] = [
  {
    id: 'overview',
    label: 'nav.overview',
    nodes: [
      { id: 'dashboard', label: 'nav.dashboard', icon: LayoutDashboard, to: '/dashboard', cap: 'dashboard.view' },
      {
        id: 'registry', label: 'nav.registry', icon: Folder, feature: 'registry', children: [
          { id: 'owners', label: 'nav.owners', icon: Users, to: '/registry/owners', cap: 'registry.view' },
          { id: 'pets', label: 'nav.pets', icon: PawPrint, to: '/registry/pets', cap: 'registry.view' },
          { id: 'participants', label: 'nav.participants', icon: Users, to: '/registry/participants', cap: 'registry.write' },
        ],
      },
      {
        id: 'census', label: 'nav.census', icon: ClipboardList, feature: 'census', children: [
          { id: 'census-submit', label: 'nav.censusSubmit', icon: ClipboardList, to: '/census/new', cap: 'census.submit' },
          { id: 'census-import', label: 'nav.censusImport', icon: ArrowLeftRight, to: '/census/import', cap: 'census.submit' },
          { id: 'census-mine', label: 'nav.censusMine', icon: ClipboardList, to: '/census/mine', cap: 'census.submit' },
          {
            id: 'census-review', label: 'nav.censusReview', icon: ClipboardCheck, cap: 'census.review', children: [
              { id: 'census-pending', label: 'nav.pending', to: '/census/review/pending' },
              { id: 'census-approved', label: 'nav.approved', to: '/census/review/approved' },
              { id: 'census-rejected', label: 'nav.rejected', to: '/census/review/rejected' },
            ],
          },
          { id: 'census-summary', label: 'nav.censusSummary', icon: FileText, to: '/census/summary', cap: 'census.reports' },
          { id: 'census-front', label: 'nav.censusFront', icon: FileText, to: '/census/front-page', cap: 'census.reports' },
        ],
      },
      {
        id: 'field', label: 'nav.field', icon: MapPin, feature: 'operations', children: [
          { id: 'programs', label: 'nav.programs', icon: CalendarDays, to: '/programs', cap: 'programs.manage' },
          { id: 'program-day', label: 'nav.programDay', icon: MapPin, to: '/program-day', cap: 'program_day.manage' },
          { id: 'program-interest', label: 'nav.programInterest', icon: ClipboardList, to: '/program-interest', cap: 'program_interest.view' },
          { id: 'stubs', label: 'nav.stubs', icon: Ticket, to: '/stubs', cap: 'stubs.manage' },
          { id: 'services', label: 'nav.services', icon: Stethoscope, to: '/services', cap: 'services.manage' },
        ],
      },
      {
        id: 'people', label: 'nav.people', icon: Users, children: [
          { id: 'paravets', label: 'nav.paravets', icon: Stethoscope, to: '/paravets', cap: 'paravets.manage', feature: 'field-team' },
          { id: 'accounts', label: 'nav.accounts', icon: UserCog, to: '/accounts', cap: 'accounts.manage_portal', feature: 'accounts' },
          { id: 'barangays', label: 'nav.barangays', icon: MapPin, to: '/barangays', cap: 'barangays.view' },
        ],
      },
      {
        id: 'insights', label: 'nav.insights', icon: BarChart3, children: [
          { id: 'report-basket', label: 'nav.reportBasket', icon: FileText, to: '/report-basket' },
          { id: 'reports', label: 'nav.reports', icon: BarChart3, to: '/reports', cap: 'reports.view', feature: 'reports' },
          { id: 'quality', label: 'nav.quality', icon: ShieldCheck, to: '/data-quality', cap: 'quality.view', feature: 'data-quality' },
        ],
      },
      {
        id: 'data', label: 'nav.data', icon: Database, feature: 'data-management', children: [
          { id: 'import-export', label: 'nav.importExport', icon: ArrowLeftRight, to: '/import-export', cap: 'data.import' },
        ],
      },
      {
        id: 'system', label: 'nav.system', icon: KeyRound, children: [
          { id: 'audit', label: 'nav.audit', icon: ScrollText, to: '/audit', cap: 'audit.view' },
          { id: 'access', label: 'nav.access', icon: KeyRound, to: '/access', cap: 'grants.manage' },
          { id: 'access-request', label: 'nav.access', icon: KeyRound, to: '/access/requests', cap: 'requests.submit' },
          { id: 'issues', label: 'nav.issues', icon: Bug, to: '/issues', cap: 'issues.manage' },
          { id: 'issue-report', label: 'nav.issues', icon: Bug, to: '/issues/new', cap: 'issues.submit' },
        ],
      },
    ],
  },
];

export interface NavTrail { node: NavNode; ancestors: NavNode[] }

export function flatten(nodes: NavNode[], ancestors: NavNode[] = []): NavTrail[] {
  return nodes.flatMap((node) => [{ node, ancestors }, ...flatten(node.children ?? [], [...ancestors, node])]);
}

/** The deepest node whose URL is the start of `pathname`. */
export function findActive(nodes: NavNode[], pathname: string): NavTrail | null {
  let best: NavTrail | null = null;
  for (const trail of flatten(nodes)) {
    const to = trail.node.to;
    if (!to) continue;
    if ((pathname === to || pathname.startsWith(`${to}/`)) && (!best || to.length > (best.node.to ?? '').length)) best = trail;
  }
  return best;
}

export function filterNav(nodes: NavNode[], allow: (node: NavNode) => boolean): NavNode[] {
  return nodes.flatMap((node) => {
    if (!allow(node)) return [];
    if (!node.children) return [node];
    const children = filterNav(node.children, allow);
    return children.length ? [{ ...node, children }] : [];
  });
}
