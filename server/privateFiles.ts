import { randomUUID } from 'node:crypto';
import { config } from './config';
import { sql } from './db';
import { AppError, notFound } from './errors';

type Purpose = 'profiles' | 'census' | 'stubs';
const storageError = () => new AppError(503, 'FILE_STORAGE_UNAVAILABLE', 'File storage is unavailable. Please try again.');

/** Internal only: callers must check the owning record/account before invoking this module. */
async function storageRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const cfg = config();
  if (cfg.fileStorageDriver !== 'supabase') throw storageError();
  try {
    const response = await fetch(`${cfg.supabaseUrl}/storage/v1/${path}`, {
      ...options,
      headers: {
        apikey: cfg.supabaseSecretKey,
        // Current secret keys use apikey only. Legacy service-role JWTs also need Bearer.
        ...(cfg.supabaseSecretKey.startsWith('eyJ') ? { Authorization: `Bearer ${cfg.supabaseSecretKey}` } : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw storageError();
    }
    return response;
  } catch { throw storageError(); }
}

/** Write metadata before upload so a failed upload or later transaction is recoverable by cleanup. */
export async function storePrivateFile(bytes: Buffer, mime: string, purpose: Purpose): Promise<string | null> {
  if (config().fileStorageDriver === 'database') return null;
  const id = randomUUID(), path = `${purpose}/${id}`;
  await sql()`insert into ekapon.private_files(id,object_path,mime,bytes) values(${id}::uuid,${path},${mime},${bytes.length})`;
  const response = await storageRequest(`object/${config().storageBucket}/${path}`, {
    method: 'POST', headers: { 'Content-Type': mime, 'x-upsert': 'false', 'Cache-Control': 'no-store' },
    body: new Uint8Array(bytes),
  });
  await response.body?.cancel();
  return id;
}

export async function readPrivateFile(id: string): Promise<{ mime: string; data: string }> {
  const [file] = await sql()`select object_path,mime,bytes from ekapon.private_files where id=${id}::uuid`;
  if (!file) throw notFound('File not found.');
  const response = await storageRequest(`object/authenticated/${config().storageBucket}/${file.object_path}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== file.bytes) throw storageError();
  return { mime: file.mime, data: bytes.toString('base64') };
}

/** A shared census photo is retained until every referencing submission releases it. */
export async function cleanupPrivateFiles(): Promise<number> {
  if (config().fileStorageDriver !== 'supabase') return 0;
  const files = await sql()`select f.id,f.object_path from ekapon.private_files f
    where f.created_at < now()-interval '1 hour'
      and not exists(select 1 from ekapon.account_preferences p where p.profile_file_id=f.id)
      and not exists(select 1 from ekapon.census_attachments a where a.file_id=f.id)
      and not exists(select 1 from ekapon.stub_batches b where b.external_pdf_file_id=f.id)
    order by f.created_at limit 50`;
  if (!files.length) return 0;
  const response = await storageRequest(`object/${config().storageBucket}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: files.map(file => file.object_path) }),
  });
  await response.body?.cancel();
  await sql()`delete from ekapon.private_files where id=any(${files.map(file => file.id)}::uuid[])`;
  return files.length;
}
