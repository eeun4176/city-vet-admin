export const SEARCH_SOURCES = ['owner','pet','census','respondent','program','campaign','interest','attendance','stub-batch','stub','standalone','account','paravet','legacy-respondent','legacy-participant','legacy-service','legacy-stub','legacy-household','legacy-animal'] as const;
export type SearchSource = typeof SEARCH_SOURCES[number];
export interface SearchItem {
 key:string; kind:string; dataset:string; id:string; label:string; detail:string;
 source:string; sourceKey:SearchSource; status:string; history:boolean; updatedAt:string; to:string;
}
export interface SearchPage {data:SearchItem[];hasMore:boolean;limit:number}
export interface RecordPreview {
 item:SearchItem;fields:Record<string,unknown>;
 groups:{title:string;records:Record<string,unknown>[]}[];
 history:{action:string;actor?:string;at?:string;reason?:string|null}[];
 workspace:{label:string;to:string}|null;
}
export const previewLink=(source:SearchSource,id:string)=>`/records/view?source=${source}&id=${encodeURIComponent(id)}`;
/** Visual navigation context only; the server independently authorizes every preview. */
export function previewSection(source:string,role:string){
 if(source==='owner'||source==='pet')return `/registry/${source==='owner'?'owners':'pets'}`;
 if(source==='census')return role==='Paravet'?'/census/mine':'/census/review';
 if(source==='respondent'||source==='legacy-respondent')return '/registry/respondents';
 if(source==='legacy-participant')return '/registry/participants';
 if(source==='program'||source==='attendance')return '/program-day';
 if(source==='campaign'||source==='interest')return '/program-interest';
 if(source==='stub'||source==='stub-batch'||source==='legacy-stub')return '/stubs';
 if(source==='standalone'||source==='legacy-service')return '/services';
 if(source==='account')return '/accounts';
 if(source==='paravet')return '/paravets';
 if(source==='legacy-household'||source==='legacy-animal')return '/registry';
 return '/dashboard';
}
