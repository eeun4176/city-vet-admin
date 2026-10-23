export async function readQrImage(file:File,rotation=0,signal?:AbortSignal):Promise<string[]>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG, or WebP image.');
 if(file.size>12*1024*1024)throw new Error('Choose an image smaller than 12 MB, or crop it to the stub.');
 const bitmap=await createImageBitmap(file);
 try{
  if(bitmap.width*bitmap.height>32_000_000)throw new Error('This image is too large. Crop or resize it to the stub first.');
  if(signal?.aborted)throw new Error('Image reading cancelled.');
  const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas'),width=Math.round(bitmap.width*scale),height=Math.round(bitmap.height*scale);
  canvas.width=rotation%180===0?width:height;canvas.height=rotation%180===0?height:width;
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Image reading is unavailable in this browser. Paste the QR text instead.');
  context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);
  context.translate(canvas.width/2,canvas.height/2);context.rotate(rotation*Math.PI/180);context.drawImage(bitmap,-width/2,-height/2,width,height);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  return await new Promise<string[]>((resolve,reject)=>{
   const worker=new Worker(new URL('./qrImageWorker.ts',import.meta.url),{type:'module'});
   const done=(error?:string,codes?:string[])=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);worker.terminate();error?reject(new Error(error)):resolve(codes??[]);};
   const cancel=()=>done('Image reading cancelled.');
   const timer=setTimeout(()=>done('Image reading took too long. Crop the image to one stub and retry.'),20000);
   signal?.addEventListener('abort',cancel,{once:true});
   worker.onmessage=e=>done(e.data.error,e.data.codes);worker.onerror=()=>done('Unable to read the image. Try another photo or paste the QR text.');
   worker.postMessage({pixels:pixels.data,width:pixels.width,height:pixels.height},[pixels.data.buffer]);
  });
 }finally{bitmap.close();}
}
