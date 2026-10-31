import { Component,type ReactNode } from 'react';
import { btnGhost,btnPrimary } from './ui';
export function PageLoadRecovery(){
 return <section role="alert" className="mx-auto max-w-lg space-y-4 rounded-xl border border-slate-200 p-5 dark:border-night-border"><h1 className="text-xl font-semibold">This page could not be loaded</h1><p className="text-sm text-slate-500">The app may have been updated while this tab was open. Reload to load the current page files.</p><div className="flex flex-wrap gap-2"><button className={btnPrimary} onClick={()=>window.location.reload()}>Reload page</button><a className={btnGhost} href="/dashboard">Dashboard</a></div></section>;
}
// resetKey (the query string) clears a failure without remounting the page, so ?recordId= and URL filters keep the page's state.
export class PageErrorBoundary extends Component<{children:ReactNode;resetKey?:string},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidUpdate(previous:{resetKey?:string}){if(this.state.failed&&previous.resetKey!==this.props.resetKey)this.setState({failed:false});}
 render(){return this.state.failed?<PageLoadRecovery/>:this.props.children;}
}
