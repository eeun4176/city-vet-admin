import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { basketIdentity,basketValues,BASKET_LIMIT } from '../../shared/reportBasket';

export type BasketValue = string | number | boolean | null;

export interface BasketRecord {
  key: string;
  source: string;
  id: string;
  label: string;
  values: Record<string, BasketValue>;
  selectedFields: string[];
}

interface BasketContextValue {
  items: BasketRecord[];
  addRows: (source: string, rows: Array<Record<string, unknown>>) => { added: number; skipped: number };
  setFields: (key: string, fields: string[]) => void;
  remove: (key: string) => void;
  clear: () => void;
  replaceItems:(items:BasketRecord[])=>void;
  undo:()=>void;redo:()=>void;canUndo:boolean;canRedo:boolean;
}

const BasketContext = createContext<BasketContextValue | null>(null);
const MAX_BASKET_RECORDS = BASKET_LIMIT;

function basketKey(accountId: number | undefined): string {
  return `cv.report-basket.v1.${accountId ?? 'anonymous'}`;
}

function readBasket(key: string): BasketRecord[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]');
    if (!Array.isArray(value)) throw new Error('Stored report basket is not a list.');
    return value.filter((item): item is BasketRecord =>
      typeof item === 'object' && item !== null
      && typeof item.key === 'string' && typeof item.source === 'string'
      && typeof item.id === 'string' && typeof item.label === 'string'
      && Array.isArray(item.selectedFields)
      && typeof item.values === 'object' && item.values !== null,
    ).slice(0, MAX_BASKET_RECORDS).map(item=>({...item,values:basketValues(item.values),selectedFields:item.selectedFields.filter((field:unknown)=>typeof field==='string'&&field in basketValues(item.values))}));
  } catch (error) {
    window.dispatchEvent(new CustomEvent('cv:api-error', {
      detail: { message: error instanceof Error ? `Could not restore the report basket: ${error.message}` : 'Could not restore the report basket.' },
    }));
    return [];
  }
}

export function ReportBasketProvider({ children }: { children: ReactNode }) { const {account}=useAuth();return <AccountBasket key={account?.id??'anonymous'}>{children}</AccountBasket>; }
function AccountBasket({ children }: { children: ReactNode }) {
  const { account } = useAuth();
  const storageKey = basketKey(account?.id);
  const [items, setItems] = useState<BasketRecord[]>(() => readBasket(storageKey));
  const itemsRef = useRef(items); itemsRef.current = items;
  const [past,setPast]=useState<BasketRecord[][]>([]),[future,setFuture]=useState<BasketRecord[][]>([]);
  const commit=useCallback((next:BasketRecord[])=>{setPast(a=>[...a.slice(-19),itemsRef.current]);setFuture([]);itemsRef.current=next;setItems(next);},[]);
  const undo=()=>{if(!past.length)return;const prior=past[past.length-1];setFuture(a=>[itemsRef.current,...a].slice(0,20));setPast(a=>a.slice(0,-1));itemsRef.current=prior;setItems(prior);};
  const redo=()=>{if(!future.length)return;const next=future[0];setPast(a=>[...a,itemsRef.current]);setFuture(a=>a.slice(1));itemsRef.current=next;setItems(next);};
  const replaceItems=(next:BasketRecord[])=>commit(next.slice(0,BASKET_LIMIT).map(i=>({...i,values:basketValues(i.values),selectedFields:i.selectedFields.filter(f=>f in basketValues(i.values))})));

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(items));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('cv:api-error', {
        detail: { message: error instanceof Error ? `Could not save the report basket: ${error.message}` : 'Could not save the report basket.' },
      }));
    }
  }, [items, storageKey]);

  const addRows = useCallback((source: string, rows: Array<Record<string, unknown>>) => {
    let added = 0;
    let skipped = 0;
      const next = [...itemsRef.current];
      for (const row of rows) {
        const id = String(row.id ?? '');
        const values = basketValues(row);
        if (!id || !Object.keys(values).length) {
          skipped += 1;
          continue;
        }
        const key = basketIdentity(source,id,values);
        const existingIndex = next.findIndex((item) => basketIdentity(item.source,item.id,item.values) === key);
        const selectedFields = existingIndex < 0
          ? Object.keys(values)
          : next[existingIndex].selectedFields.filter((field) => field in values);
        const item: BasketRecord = {
          key,
          source,
          id,
          label: String(row.name ?? row.fullName ?? row.owner_name ?? row.petName ?? row.pet_name ?? row.title ?? row.label ?? `${source} ${id}`),
          values,
          selectedFields,
        };
        if (existingIndex >= 0) next[existingIndex] = item;
        else if (next.length < MAX_BASKET_RECORDS) {
          next.push(item);
          added += 1;
        } else skipped += 1;
      }
      commit(next);
    return { added, skipped };
  }, [commit]);

  const setFields = (key:string,fields:string[])=>commit(itemsRef.current.map(i=>i.key===key?{...i,selectedFields:fields.filter(f=>f in i.values)}:i));
  const remove = (key:string)=>commit(itemsRef.current.filter(i=>i.key!==key));
  const clear = ()=>commit([]);
  const value = {items,addRows,setFields,remove,clear,replaceItems,undo,redo,canUndo:past.length>0,canRedo:future.length>0};
  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useReportBasket(): BasketContextValue {
  const context = useContext(BasketContext);
  if (!context) throw new Error('useReportBasket must be used inside ReportBasketProvider');
  return context;
}
