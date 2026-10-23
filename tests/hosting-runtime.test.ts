import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage } from 'node:http';
import { route, ok } from '../server/http';

afterEach(()=>{vi.unstubAllEnvs();});
describe('hosted runtime boundaries',()=>{
  it('enforces byte limits on both Vercel parsed objects and parsed strings',async()=>{
    let accepted=0;
    const handler=route({POST:async()=>{accepted++;return ok({saved:true});}},{maxBody:1000});
    const server=createServer((req,res)=>{
      const request=req as IncomingMessage & {body:unknown};
      const value={text:'中'.repeat(req.url==='/small'?10:500)};
      request.body=req.url==='/string'?JSON.stringify(value):value;
      void handler(request,res);
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    try{
      for(const path of ['/object','/string']){
        const reply=await fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});
        expect(reply.status).toBe(413);expect((await reply.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
      }
      expect((await fetch(base+'/small',{method:'POST',headers:{Origin:base},body:'{}'})).status).toBe(200);
      expect(accepted).toBe(1);
    }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
  it('requires production storage credentials and refuses an inline fallback',async()=>{
    vi.resetModules();vi.stubEnv('NODE_ENV','production');vi.stubEnv('FILE_STORAGE_DRIVER','database');
    let module=await import('../server/config');
    expect(()=>module.config()).toThrow('Production requires private Supabase');
    vi.resetModules();vi.stubEnv('FILE_STORAGE_DRIVER','supabase');vi.stubEnv('SUPABASE_URL','');
    module=await import('../server/config');expect(()=>module.config()).toThrow('SUPABASE_URL is required');
  });
  it('rejects non-project storage destinations and accepts server-only project configuration',async()=>{
    vi.resetModules();vi.stubEnv('FILE_STORAGE_DRIVER','supabase');vi.stubEnv('SUPABASE_URL','https://attacker.example');
    vi.stubEnv('SUPABASE_SECRET_KEY','sb_secret_isolated_test_not_a_real_key_123456');
    let module=await import('../server/config');expect(()=>module.config()).toThrow('HTTPS project URL');
    vi.resetModules();vi.stubEnv('SUPABASE_URL','https://isolated-test.supabase.co');
    module=await import('../server/config');expect(module.config()).toMatchObject({fileStorageDriver:'supabase',storageBucket:'ekapon-private'});
  });
});
