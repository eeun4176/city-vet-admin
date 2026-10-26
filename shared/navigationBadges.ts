import type { Capability } from './permissions';
export type NavigationBadge = { pending: number; updated: boolean };
export type NavigationBadges = Record<string, NavigationBadge>;
export const BADGE_NODES: Record<string, { cap?: Capability; features?: string[]; to: string; reads: string[] }> = {
  owners: { cap:'registry.view',features:['registry'],to:'/registry/owners',reads:['/records/owners','/registry-workspace'] },
  pets: { cap:'registry.view',features:['registry'],to:'/registry/pets',reads:['/records/pets','/registry-workspace'] },
  respondents: { cap:'registry.write',features:['registry','operations'],to:'/registry/respondents',reads:['/records/respondents','/field-records'] },
  participants: { cap:'registry.write',features:['registry','operations'],to:'/registry/participants',reads:['/records/participants','/field-records'] },
  'census-mine': { cap:'census.submit',features:['census'],to:'/census/mine',reads:['/census/submissions'] },
  'census-pending': { cap:'census.review',features:['census'],to:'/census/review/pending',reads:['/census/submissions'] },
  'census-approved': { cap:'census.review',features:['census'],to:'/census/review/approved',reads:['/census/submissions'] },
  'census-rejected': { cap:'census.review',features:['census'],to:'/census/review/rejected',reads:['/census/submissions'] },
  'census-summary': { cap:'census.reports',features:['census'],to:'/census/summary',reads:['/census/summary'] },
  'census-front': { cap:'census.reports',features:['census'],to:'/census/front-page',reads:['/census/front-page'] },
  programs: { cap:'programs.manage',features:['operations'],to:'/programs',reads:['/program-workspace'] },
  'program-day': { cap:'program_day.manage',features:['operations'],to:'/program-day',reads:['/program-workspace'] },
  'program-interest': { cap:'program_interest.view',features:['operations'],to:'/program-interest',reads:['/program-interest'] },
  stubs: { cap:'stubs.manage',features:['operations'],to:'/stubs',reads:['/stub-workflow'] },
  services: { cap:'services.manage',features:['registry','operations'],to:'/services',reads:['/records/services','/field-records'] },
  paravets: { cap:'paravets.manage',features:['field-team'],to:'/paravets',reads:['/records/paravets'] },
  accounts: { cap:'accounts.manage_portal',features:['accounts'],to:'/accounts',reads:['/accounts'] },
  barangays: { cap:'barangays.view',to:'/barangays',reads:['/barangays'] },
  reports: { cap:'reports.view',features:['reports'],to:'/reports',reads:['/program-outcomes','/program-kpis','/analytics','/reports','/spay-neuter-report'] },
  quality: { cap:'quality.view',features:['data-quality','registry'],to:'/data-quality',reads:['/data-quality'] },
  access: { cap:'grants.manage',to:'/access',reads:['/access/requests','/access/grants'] },
  'access-request': { cap:'requests.submit',to:'/access/requests',reads:['/access/requests'] },
  issues: { cap:'issues.manage',to:'/issues',reads:['/issues'] },
  inbox: { to:'/inbox',reads:['/notifications'] },
};
export function badgeNodeForPage(path: string): string | null {
  return Object.entries(BADGE_NODES).filter(([,n])=>path===n.to||path.startsWith(`${n.to}/`))
    .sort((a,b)=>b[1].to.length-a[1].to.length)[0]?.[0] ?? null;
}
/** Only reads containing that section's records can acknowledge its update marker. */
export function isBadgePageRead(node: string, apiPath: string): boolean {
  const config=BADGE_NODES[node]; if(!config)return false;
  const url=new URL(apiPath,'http://local');
  if(url.pathname==='/field-records'&&url.searchParams.get('kind')!==node)return false;
  if(node==='issues'&&url.pathname!=='/issues'&&!/^\/issues\/\d+$/.test(url.pathname))return false;
  if(url.pathname==='/registry-workspace' && url.searchParams.get('kind')!==node)return false;
  if(node.startsWith('census-')&&config.reads[0]==='/census/submissions'&&url.pathname==='/census/submissions'){
    const status=node.slice('census-'.length);if(status!=='mine'&&url.searchParams.get('status')!==status)return false;
  }
  if(config.reads[0]==='/census/submissions'&&url.pathname!=='/census/submissions'&&!/^\/census\/submissions\/[0-9a-f-]{36}$/i.test(url.pathname))return false;
  if(node==='reports'&&url.pathname==='/reports'&&url.searchParams.get('mode')==='options')return false;
  return config.reads.some((path)=>url.pathname===path||url.pathname.startsWith(`${path}/`));
}
export function descendantBadge(nodes: {id:string;children?:any[]}[], badges: NavigationBadges): boolean {
  return nodes.some((n)=>(badges[n.id]?.pending??0)>0||badges[n.id]?.updated||descendantBadge(n.children??[],badges));
}
export const pendingLabel = (node: string, count: number) => {
  const descriptions: Record<string,string> = {'census-pending':'census submissions awaiting review','program-interest':'program requests awaiting review or scheduling',stubs:'stub batches awaiting review, printing, or handover',quality:'flagged record pairs awaiting review',access:'permission requests awaiting decision',issues:'open or in-progress issue reports',inbox:'unread messages'};
  return `${count} ${descriptions[node]??'items needing action'}`;
};
