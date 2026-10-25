/* Saves a chart card (SVG charts, bar lists and the heatmap table alike) as a PNG for slides.
   The card is copied with its computed styles into an SVG <foreignObject> and drawn at 2× on a canvas filled with the page background.
   Elements marked data-export-ignore (the save button itself) are left out; scrolled-away columns are included. */
// shortcut: web fonts are not embedded, so the image uses the system sans-serif; embed Inter as a data URL if slides need the exact font.
export async function downloadChartPng(card: HTMLElement, fileName: string, scale = 2) {
  const clone = card.cloneNode(true) as HTMLElement;
  let extraWidth = 0;
  const copyStyles = (source: Element, target: Element) => {
    const style = getComputedStyle(source);
    const targetStyle = (target as HTMLElement | SVGElement).style;
    targetStyle.cssText = Array.from(style).map((name) => `${name}:${style.getPropertyValue(name)}`).join(';');
    if (/(auto|scroll)/.test(style.overflowX) && source.scrollWidth > source.clientWidth) {
      extraWidth = Math.max(extraWidth, source.scrollWidth - source.clientWidth);
      targetStyle.overflow = 'visible';
      targetStyle.width = `${source.scrollWidth}px`;
    }
    Array.from(source.children).forEach((child, index) => copyStyles(child, target.children[index]));
  };
  copyStyles(card, clone);
  clone.querySelectorAll('[data-export-ignore]').forEach((node) => node.remove());
  const width = card.offsetWidth + extraWidth, height = card.offsetHeight;
  Object.assign(clone.style, { width: `${width}px`, height: `${height}px`, margin: '0' });
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(clone)}</foreignObject></svg>`;
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('The chart could not be saved as an image.'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot save chart images.');
  context.fillStyle = getComputedStyle(document.body).backgroundColor || '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  context.drawImage(image, 0, 0);
  const link = document.createElement('a');
  link.download = `${fileName.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'chart'}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
