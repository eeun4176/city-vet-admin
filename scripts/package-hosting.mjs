import { mkdir, readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import './check-hosting.mjs';

// Allowlist source only. Never enumerate or read .env, local database, samples, output or backups.
const directories=['api','api-handlers','server','shared','src','public','db','tests','scripts','docs','hosting'];
const files=['package.json','package-lock.json','index.html','postcss.config.cjs','tailwind.config.ts',
  'tsconfig.json','tsconfig.app.json','vite.config.mts','vitest.config.mts','vercel.json','.gitignore','.vercelignore','README.md','README-BACKEND.md','system-admin-ready'];
const root=resolve('.');
const destination=resolve('output','hosting',`release-${new Date().toISOString().replace(/[:.]/g,'-')}`);
if(!destination.startsWith(resolve('output','hosting')+ (process.platform==='win32'?'\\':'/')))throw new Error('Invalid output path.');
await mkdir(destination,{recursive:true});
const manifest=[];
async function copy(path) {
  if(/(^|[\\/])(?:\.env(?:\..*)?|node_modules|dist|\.local-test-db|Backup Files|output|tmp|\.git|\.vercel)(?:[\\/]|$)/i.test(path))throw new Error('Excluded path in package allowlist.');
  const input=resolve(root,path);
  if(relative(root,input).startsWith('..'))throw new Error('Package source escaped application root.');
  const stat=await lstat(input);
  if(stat.isSymbolicLink())throw new Error(`Refusing a symlink in deployment source: ${path}`);
  if(stat.isDirectory()) {
    await mkdir(join(destination,path),{recursive:true});
    for(const child of (await readdir(input)).sort())await copy(join(path,child));
  } else if(stat.isFile()) {
    const bytes=await readFile(input);await writeFile(join(destination,path),bytes);
    manifest.push({path:path.replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
}
for(const dir of directories)await copy(dir);
for(const file of files)await copy(file);
await writeFile(join(destination,'PACKAGE-MANIFEST.json'),JSON.stringify({format:'ekapon-hosting-source-v1',repository:'https://github.com/Reiiimr/congenial-parakeet',rootDirectory:'.',containsOperationalData:false,files:manifest},null,2)+'\n');
console.log(`Prepared ${manifest.length} source files in ${relative(root,destination)}. No secrets or local database files were read. No Git push or deployment was performed.`);
