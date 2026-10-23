import type { Session } from './auth';
import { unprocessable } from './errors';
import type { ReportInsights,ReportInsight } from '../shared/reporting';
export async function reportInsights(q:any,s:Session,year:number,barangayId=0):Promise<ReportInsights>{
 const [area]=barangayId?await q`select name from ekapon.barangays where id=${barangayId}`:[{name:''}];
 if(barangayId&&!area)throw unprocessable('BARANGAY_REQUIRED','Choose an official barangay.');
 const scope=s.type==='Paravet'?s.barangay??'':area?.name??'';
 const [totals]=await q`select count(*) filter(where dataset='owners')::int as owners,count(*) filter(where dataset='pets')::int as pets,
 count(*) filter(where dataset='pets' and lower(coalesce(record_data->>'vaccinationStatus',record_data->>'vaccinated','')) in ('yes','true','vaccinated'))::int as vaccinated,
 count(*) filter(where dataset='pets' and lower(coalesce(record_data->>'vaccinationStatus',record_data->>'vaccinated','')) not in ('yes','true','vaccinated','no','false','unvaccinated'))::int as unknown,
 count(*) filter(where record_data->>'_syntheticData'='true')::int as synthetic
 from ekapon.dashboard_records where dataset in ('owners','pets') and not archived and coalesce(record_data->>'_sampleData','false')<>'true' and (${scope}='' or lower(record_data->>'barangay')=lower(${scope}))`;
 const services=await q`select record_data from ekapon.dashboard_records where dataset='services' and not archived and coalesce(record_data->>'_sampleData','false')<>'true' and lower(coalesce(record_data->>'status',record_data->>'outcome','')) in ('completed','attended') and (${scope}='' or lower(record_data->>'barangay')=lower(${scope})) and left(coalesce(record_data->>'date',record_data->>'visit_date',''),4)=${String(year)} limit 50001`;
 if(services.length>50000)throw unprocessable('REPORT_SCOPE_TOO_LARGE','Narrow the report to a barangay. This view supports up to 50,000 service rows.');
 const monthly=Array.from({length:12},(_,i)=>({label:new Date(Date.UTC(2000,i,1)).toLocaleDateString('en',{month:'short',timeZone:'UTC'}),value:0,real:0}));
 let synthetic=Number(totals.synthetic),dated=0,realCount=0,undated=0;
 for(const {record_data:d} of services){const date=String(d.date??d.visit_date??'').slice(0,10);const parsed=new Date(`${date}T00:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date){undated++;continue;}
  if(date>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}))continue;
  dated++;monthly[Number(date.slice(5,7))-1].value++;
  if(d._syntheticData===true)synthetic++;else{realCount++;monthly[Number(date.slice(5,7))-1].real++;}
 }
 const months=monthly.filter(m=>m.real>0),available=months.length>=3&&realCount>=10;
 const estimate=available?Math.round(months.slice(-3).reduce((a,b)=>a+b.real,0)/3):null;
 const source=synthetic?'Includes synthetic reference records; never evidence of actual delivery.':'Stored system records; review completeness before decisions.';
 const common={year,barangay:scope||'All barangays',dataSource:source,methodology:'registry-and-service-records-v2'};
 const block=(stage:ReportInsight['stage'],label:string,values:ReportInsight['values']):ReportInsight=>({id:`${stage}:${year}:${barangayId}`,stage,label,values:{...common,...values}});
 return {year,barangayId,generatedAt:new Date().toISOString(),syntheticRecords:synthetic,blocks:[
  block('descriptive','Registry and service summary',{owners:Number(totals.owners),pets:Number(totals.pets),completedServiceRows:dated,chartData:JSON.stringify(monthly.map(({label,value})=>({label,value}))),interpretation:'Owner and pet counts are current registry snapshots. Service rows use the selected year. Repeat service visits are not unique pets.'}),
  block('diagnostic','Documentation and service gaps',{vaccinatedStatusRecorded:Number(totals.vaccinated),vaccinationUnknown:Number(totals.unknown),undatedServices:undated,interpretation:`${totals.unknown} pets have unknown vaccination status. This is a documentation gap; it does not prove they are unvaccinated. Registry status is not population coverage. Counts alone do not establish causes.`}),
  block('predictive','Next observed-month service baseline',{estimate,eligibleServiceRows:realCount,observedMonths:months.length,available,interpretation:available?'Mean of the last three observed months of dated, completed, non-synthetic service rows. Advisory baseline, not a forecast of unique demand. Gaps and seasonality are not modelled.':'Unavailable: requires at least 10 dated, completed, non-synthetic service rows across 3 months. Synthetic records never satisfy this requirement.'}),
  block('prescriptive','Suggested planning actions',{priority:Number(totals.unknown)>0?'Verify missing vaccination histories':'Review barangay service demand',recommendation:available?'Compare the baseline with active interest lists, available slots and staffing before scheduling.':'Collect and verify service dates and outcomes before using estimates. Use verified interest lists for near-term capacity planning.',followUp:'Review possible duplicate owners by ID, address, contact and pets. Prepare stubs after program creation.',decisionRule:'Staff must approve priorities and resources. These suggestions do not schedule or approve programs automatically.'}),
 ]};
}
