import { ExternalLink,ScanText } from 'lucide-react';
import { btnGhost } from './ui';
export const SALIN_URL='https://salin-puce.vercel.app/';
export function DocumentReaderButton(){return <a href={SALIN_URL} target="_blank" rel="noopener noreferrer" className={`${btnGhost} print:hidden`} title="Open Salin to prepare documents, then return to upload the prepared file"><ScanText className="h-4 w-4" aria-hidden/>Prepare files in Salin<ExternalLink className="h-3 w-3" aria-hidden/></a>;}
