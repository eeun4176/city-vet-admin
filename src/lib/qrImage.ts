import type jsQR from 'jsqr';

/** Decode locally, masking each result so a page containing several stubs needs a choice. */
export function codesFromPixels(pixels:Uint8ClampedArray,width:number,height:number,decode:typeof jsQR):string[]{
 const codes:string[]=[];
 const regions=[[0,0,width,height]];
 // Adjacent finder patterns can confuse a whole-page decode. Overlapping tiles isolate stubs.
 if(width>=500||height>=500){
  const w=width>=500?Math.ceil(width/2):width,h=height>=500?Math.ceil(height/2):height;
  for(const y of h===height?[0]:[0,Math.floor((height-h)/2),height-h])for(const x of w===width?[0]:[0,Math.floor((width-w)/2),width-w])regions.push([x,y,w,h]);
 }
 for(const [left,top,w,h] of regions){
 const working=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)working.set(pixels.subarray(((top+y)*width+left)*4,((top+y)*width+left+w)*4),y*w*4);
 for(let pass=0;pass<9;pass++){
  const result=decode(working,w,h,{inversionAttempts:'attemptBoth'});
  if(!result)break;
  if(!codes.includes(result.data.trim()))codes.push(result.data.trim());
  const points=[result.location.topLeftCorner,result.location.topRightCorner,result.location.bottomLeftCorner,result.location.bottomRightCorner];
  const x1=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x)))-2),right=Math.min(w,Math.ceil(Math.max(...points.map(p=>p.x)))+2);
  const y1=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y)))-2),bottom=Math.min(h,Math.ceil(Math.max(...points.map(p=>p.y)))+2);
  for(let y=y1;y<bottom;y++)for(let x=x1;x<right;x++){const i=(y*w+x)*4;working[i]=working[i+1]=working[i+2]=working[i+3]=255;}
 }
 }
 if(codes.length>8)throw new Error('This image contains many QR codes. Crop it to the stub you want to read.');
 return codes.filter(Boolean);
}

