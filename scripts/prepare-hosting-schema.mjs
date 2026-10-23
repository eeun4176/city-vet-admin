import { mkdir, writeFile } from 'node:fs/promises';
import { buildHostingSchema } from './hosting-schema.mjs';

const { sql, manifest } = await buildHostingSchema();
await mkdir('hosting', { recursive: true });
await writeFile('hosting/01-fresh-schema.sql', sql);
await writeFile('hosting/schema-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared empty hosting schema from ${manifest.sources.length} migrations. No database was connected.`);
