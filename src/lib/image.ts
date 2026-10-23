export interface ShrunkImage { mime: 'image/jpeg'; data: string; bytes: number; preview: string; name: string }

const MAX_BYTES = 480_000;
const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/** Shrinks a phone photo to a JPEG under 480 KB so it fits the API limit while staying readable. */
export async function shrinkImage(file: File): Promise<ShrunkImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let longest = 1800;
  let quality = 0.82;
  for (let attempt = 0; attempt < 12; attempt++) {
    const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot resize photos.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', quality);
    const data = url.slice(url.indexOf(',') + 1);
    const bytes = base64Bytes(data);
    if (bytes <= MAX_BYTES) { bitmap.close(); return { mime: 'image/jpeg', data, bytes, preview: url, name: file.name }; }
    if (quality > 0.55) quality -= 0.1; else longest = Math.round(longest * 0.8);
  }
  bitmap.close();
  throw new Error(`${file.name} could not be made small enough. Try a closer, flatter photo.`);
}
