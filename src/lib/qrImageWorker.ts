/// <reference lib="webworker" />
import jsQR from 'jsqr';
import {codesFromPixels} from './qrImage';
self.onmessage=(event:MessageEvent<{pixels:Uint8ClampedArray;width:number;height:number}>)=>{
 try{const {pixels,width,height}=event.data;self.postMessage({codes:codesFromPixels(pixels,width,height,jsQR)});}
 catch(e){self.postMessage({error:e instanceof Error?e.message:'Unable to decode image.'});}
};
