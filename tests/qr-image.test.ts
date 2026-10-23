import {describe,it,expect} from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {codesFromPixels} from '../src/lib/qrImage';
const {PNG}=require('pngjs');
async function qr(code:string){const bytes=await QRCode.toBuffer(code,{margin:4,width:300});return PNG.sync.read(bytes) as {width:number;height:number;data:Buffer};}
describe('local QR image decoder',()=>{
 it('reads an image without changing the input pixels',async()=>{const p=await qr('CVS1.synthetic-image'),pixels=new Uint8ClampedArray(p.data),before=pixels.slice();expect(codesFromPixels(pixels,p.width,p.height,jsQR)).toEqual(['CVS1.synthetic-image']);expect(pixels).toEqual(before);});
 it('returns separate choices for several stubs on one page',async()=>{const a=await qr('CVS1.first'),b=await qr('CVS1.second');const width=640,height=320,pixels=new Uint8ClampedArray(width*height*4).fill(255);for(const [index,p] of [a,b].entries())for(let y=0;y<p.height;y++)pixels.set(p.data.subarray(y*p.width*4,(y+1)*p.width*4),(y*width+index*330)*4);expect(codesFromPixels(pixels,width,height,jsQR).sort()).toEqual(['CVS1.first','CVS1.second']);});
 it('returns no result for a blank image',()=>{expect(codesFromPixels(new Uint8ClampedArray(160*160*4).fill(255),160,160,jsQR)).toEqual([]);});
});
