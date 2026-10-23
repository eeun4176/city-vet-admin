export const BASKET_LIMIT=300;
export const BASKET_SOURCES:Record<string,string>={Owners:'owners',Pets:'pets',Respondents:'respondents',Participants:'participants',Paravets:'paravets',Programs:'programs',Services:'services','Historical stub records':'stubs',Households:'households',Animals:'animals'};
const PRIVATE_FIELD=/^(?:id|.*_id|_.*|.*password.*|.*credential.*|.*secret.*|.*token.*|.*image.*|.*photo.*|accountKey|username)$/i;
export function basketValues(row:Record<string,unknown>){
  return Object.fromEntries(Object.entries(row).filter(([key,value])=>!PRIVATE_FIELD.test(key)&&!key.endsWith('Id')&&(value===null||['string','number','boolean'].includes(typeof value)))) as Record<string,string|number|boolean|null>;
}
export function basketDataset(source:string,values:Record<string,unknown>){
  return source==='Analytics evidence'?BASKET_SOURCES[String(values.dataset)]:BASKET_SOURCES[source];
}
export function basketIdentity(source:string,id:string,values:Record<string,unknown>){return `${basketDataset(source,values)??source}:${id}`;}
export const fieldLabel=(value:string)=>value.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());
