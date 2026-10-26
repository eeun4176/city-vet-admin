import { FileInput } from './FileInput';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, CameraOff, ScanLine, ImagePlus, RotateCw, X } from 'lucide-react';
import { Field, inputCls, Notice, Spinner, btnGhost, btnPrimary } from './ui';
import { readQrImage } from '../lib/readQrImage';

export function StubScanner({ onCode, disabled = false }: { onCode: (code: string) => void; disabled?: boolean }) {
  const [code, setCode] = useState('');
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [image,setImage]=useState<{file:File;url:string;rotation:number}|null>(null);
  const [reading,setReading]=useState(false),[choices,setChoices]=useState<string[]>([]);
  const imageUrl=useRef<string|null>(null);
  const readAbort=useRef<AbortController|null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef<number | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const stop = () => {
    readAbort.current?.abort();readAbort.current=null;
    generation.current += 1;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    if (mounted.current) { setActive(false); setStarting(false); }
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop();if(imageUrl.current)URL.revokeObjectURL(imageUrl.current); }; }, []);
  useEffect(() => { if (disabled) {stop();clearImage();} }, [disabled]);

  const start = async () => {
    stop();clearImage(); setError(''); setStarting(true); setActive(true);
    const current = generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS or localhost. Use the code field below.');
      const decode = (await import('jsqr')).default;
      if (!mounted.current || generation.current !== current) return;
      const camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (!mounted.current || generation.current !== current) { camera.getTracks().forEach((track) => track.stop()); return; }
      stream.current = camera;
      if (!video.current) { stop(); return; }
      video.current.srcObject = camera;
      await video.current.play();
      if (!mounted.current || generation.current !== current) return;
      setStarting(false);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('This browser cannot read the camera. Use the code field below.');
      let last = 0;
      const scan = (time: number) => {
        if (!mounted.current || generation.current !== current) return;
        const view = video.current;
        if (view && view.readyState >= 2 && time - last > 180 && view.videoWidth > 0) {
          last = time;
          const ratio = Math.min(1, 720 / view.videoWidth);
          canvas.width = Math.round(view.videoWidth * ratio); canvas.height = Math.round(view.videoHeight * ratio);
          context.drawImage(view, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          const match = decode(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
          if (match?.data) { stop(); onCodeRef.current(match.data.trim()); return; }
        }
        frame.current = requestAnimationFrame(scan);
      };
      frame.current = requestAnimationFrame(scan);
    } catch (failure) {
      if (!mounted.current || generation.current !== current) return;
      stop();
      setError(failure instanceof Error ? `${failure.message} You can paste or scan the QR text below.` : 'Camera unavailable. Use the code field below.');
    }
  };
  const clearImage=()=>{if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);imageUrl.current=null;setImage(null);setChoices([]);setReading(false);};
  const scanImage=async(file:File,rotation=0)=>{
    stop();const current=generation.current;setError('');setChoices([]);setCode('');setReading(true);
    if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);
    const url=URL.createObjectURL(file);imageUrl.current=url;setImage({file,url,rotation});
    const abort=new AbortController();readAbort.current=abort;
    try{const found=await readQrImage(file,rotation,abort.signal);if(!mounted.current||generation.current!==current)return;
      if(!found.length)throw new Error('No QR code found. Try rotating the image, choosing a clearer photo, or cropping it to one stub.');
      setChoices(found);if(found.length===1)setCode(found[0]);
    }catch(e){if(mounted.current&&generation.current===current)setError(e instanceof Error?e.message:'Unable to read this image.');}
    finally{if(mounted.current&&generation.current===current)setReading(false);}
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (code.trim() && !disabled) { stop(); onCode(code.trim()); } };
  return <div className="space-y-4">
    <p className="text-sm text-slate-500">Scan a physical stub to open its details. The stub is used only after you review and submit attendance.</p>
    {error && <Notice kind="error">{error}</Notice>}
    {active && <div className="relative overflow-hidden rounded-xl bg-slate-950">
      <video ref={video} muted playsInline className="max-h-72 w-full object-contain" aria-label="Live QR camera" />
      {starting && <div className="absolute inset-0 grid place-items-center bg-slate-950/70 text-white"><Spinner label="Starting camera…" /></div>}
    </div>}
    <div className="flex flex-wrap gap-2"><button type="button" className={btnGhost} disabled={disabled || starting || reading} onClick={() => active ? stop() : void start()}>{active ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}{active ? 'Stop camera' : 'Use camera'}</button>
    <label className={`${btnGhost} cursor-pointer`}><ImagePlus className="h-4 w-4"/>Choose QR image<FileInput aria-label="Choose QR image" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled||starting||reading} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void scanImage(file);}}/></label></div>
    {image&&<section className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-night-border"><img src={image.url} alt="Selected QR image" className="mx-auto max-h-56 max-w-full object-contain" style={{transform:`rotate(${image.rotation}deg)`}}/><p className="text-xs text-slate-500">Read on this device. This image is not uploaded or saved.</p>{reading?<Spinner label="Reading QR image…"/>:<><div className="flex flex-wrap gap-2"><button type="button" className={btnGhost} disabled={disabled} onClick={()=>void scanImage(image.file,(image.rotation+90)%360)}><RotateCw className="h-4 w-4"/>Rotate and retry</button><button type="button" className={btnGhost} onClick={()=>{stop();clearImage();setCode('');}}><X className="h-4 w-4"/>Remove image</button></div>{choices.length>1?<div className="space-y-2"><p className="text-sm">Several QR codes were found. Choose one to open.</p>{choices.map((value,i)=><button key={value} type="button" className={`${value===code?btnPrimary:btnGhost} mr-2`} onClick={()=>setCode(value)}>Code {i+1}</button>)}</div>:choices.length===1&&<p role="status" className="text-sm text-brand-700">QR code read. Open the stub to check its details.</p>}</>}</section>}
    <form onSubmit={submit} className="space-y-3">
      <Field label="QR text" hint="Paste the QR text or use a connected handheld scanner."><input autoFocus autoComplete="off" spellCheck={false} required className={inputCls} value={code} disabled={disabled} onChange={(event) => setCode(event.target.value)} placeholder="CVS1…" /></Field>
      <button type="submit" className={btnPrimary} disabled={disabled || reading || !code.trim()}><ScanLine className="h-4 w-4" />Open stub</button>
    </form>
  </div>;
}
