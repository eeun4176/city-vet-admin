/** Keep each JSON request below both the API and Vercel payload limits. Validate before any write. */
export function importChunks<T>(records: T[], fields: Record<string, unknown>, maxBytes = 2_000_000): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  const overhead = new TextEncoder().encode(JSON.stringify({ ...fields, records: [] })).length;
  let size = overhead;
  for (const record of records) {
    const bytes = new TextEncoder().encode(JSON.stringify(record)).length + 1;
    if (bytes + overhead > maxBytes) throw new Error('One record is too large to import. Shorten its source details before retrying.');
    if (current.length && (current.length >= 100 || size + bytes > maxBytes)) {
      chunks.push(current); current = []; size = overhead;
    }
    current.push(record); size += bytes;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
