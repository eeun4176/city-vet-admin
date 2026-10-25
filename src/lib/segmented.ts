/** Slides the raised pill of every segmented switcher (.seg-track) to its chosen item, so switching tabs glides instead of blinking. */
export function startSegmentedThumbs(root: HTMLElement = document.body) {
  let frame = 0;
  const resized = new ResizeObserver(() => schedule());
  const watched = new WeakSet<Element>();
  const sync = () => {
    frame = 0;
    for (const track of root.querySelectorAll<HTMLElement>('.seg-track')) {
      if (!watched.has(track)) { watched.add(track); resized.observe(track); }
      const chosen = track.querySelector<HTMLElement>(':scope > [aria-selected="true"], :scope > [aria-checked="true"], :scope > [aria-current="page"]');
      if (!chosen || !chosen.offsetWidth) { track.removeAttribute('data-thumb'); continue; }
      const place = `${chosen.offsetLeft}|${chosen.offsetTop}|${chosen.offsetWidth}|${chosen.offsetHeight}`;
      if (track.dataset.place === place) continue;
      track.dataset.place = place;
      track.style.setProperty('--thumb-x', `${chosen.offsetLeft}px`);
      track.style.setProperty('--thumb-y', `${chosen.offsetTop}px`);
      track.style.setProperty('--thumb-w', `${chosen.offsetWidth}px`);
      track.style.setProperty('--thumb-h', `${chosen.offsetHeight}px`);
      track.style.setProperty('--thumb-r', getComputedStyle(chosen).borderRadius);
      // The first placement jumps into place; later ones slide.
      if (!track.hasAttribute('data-thumb')) { track.setAttribute('data-thumb', ''); requestAnimationFrame(() => track.setAttribute('data-thumb', 'on')); }
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
  const observer = new MutationObserver(schedule);
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected', 'aria-checked', 'aria-current', 'class'] });
  window.addEventListener('resize', schedule);
  document.fonts?.ready.then(schedule).catch(() => undefined);
  schedule();
  return () => { observer.disconnect(); resized.disconnect(); window.removeEventListener('resize', schedule); cancelAnimationFrame(frame); };
}
