import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

// pngjs is the PNG decoder already supplied by qrcode. Keep its small test-only
// contract local instead of introducing a separate runtime or type dependency.
const { PNG } = require('pngjs') as {
  PNG: { sync: { read: (bytes: Buffer) => { width: number; height: number; data: Buffer } } };
};

describe('printable stub QR', () => {
  it('round-trips the rendered PNG through the scanner decoder using the print-sheet settings', async () => {
    const code = `CVS1.${'A'.repeat(22)}`;
    const dataUrl = await QRCode.toDataURL(code, {
      errorCorrectionLevel: 'M', margin: 4, width: 384,
      color: { dark: '#000000', light: '#ffffff' },
    });
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    const rendered = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
    expect(rendered.width).toBe(384); expect(rendered.height).toBe(384);
    expect([...rendered.data.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    const decoded = jsQR(new Uint8ClampedArray(rendered.data), rendered.width, rendered.height, { inversionAttempts: 'dontInvert' });
    expect(decoded?.data).toBe(code);
  });
});
