import { useEffect,useRef,useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { useApi } from './useApi';
import { api } from './api';
import { type NavigationBadges,badgeNodeForPage } from '../../shared/navigationBadges';

type BadgeResponse={badges:NavigationBadges;scope:string;updatedAt:number};
export function useNavigationBadges(){
 const {account,controls}=useAuth(),location=useLocation();
 const identity=JSON.stringify([account?.id,account?.type,account?.barangayId,account?.grants,controls?.featureAccess]);
 const result=useApi<BadgeResponse>(account?'/navigation-badges':null,{refreshIntervalMs:60000});
 const [cached,setCached]=useState<{identity:string;data:BadgeResponse}|null>(null);
 const current=useRef({identity,path:location.pathname,reload:result.reload});current.current={identity,path:location.pathname,reload:result.reload};
 const completed=useRef(new Set<string>()),pending=useRef(new Set<string>());
 useEffect(()=>{completed.current.clear();pending.current.clear();},[identity]);
 useEffect(()=>{if(result.data)setCached({identity,data:result.data});},[result.data,identity]);
 useEffect(()=>{
  const onRead=(event:Event)=>{
   const {node,token,pagePath}=(event as CustomEvent<{node:string;token:string;pagePath:string}>).detail;
   if(document.hidden||pagePath!==current.current.path||badgeNodeForPage(pagePath)!==node)return;
   let fingerprint:string;
   try{const payload=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));fingerprint=`${current.current.identity}:${node}:${payload.scope}:${payload.fingerprint}`;}catch{return;}
   if(completed.current.has(fingerprint)||pending.current.has(fingerprint))return;
   const scope=current.current.identity;pending.current.add(fingerprint);
   void api('POST','/navigation-badges',{node,token},{readOnly:true,quiet:true}).then(()=>{
    if(current.current.identity!==scope)return;
    completed.current.add(fingerprint);while(completed.current.size>64)completed.current.delete(completed.current.values().next().value!);
    current.current.reload();
   }).catch(()=>{/* Keep the dot when acknowledging failed; a later successful read can retry. */}).finally(()=>pending.current.delete(fingerprint));
  };
  window.addEventListener('cv:nav-read',onRead);return()=>window.removeEventListener('cv:nav-read',onRead);
 },[]);
 const data=result.data??(cached?.identity===identity?cached.data:null);
 return {badges:data?.badges??{},updatedAt:data?.updatedAt??null,error:result.error,reload:result.reload,loading:result.loading};
}
