import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface FlyoutProps {
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  onEnter: () => void;
  onLeave: () => void;
  role?: 'tooltip' | 'menu';
  id?: string;
  /** right: beside the anchor (default); top: above it, left-aligned, like e-Vet Field's account menu. */
  side?: 'right' | 'top';
  className?: string;
}

/**
 * Rendered through a Portal so it is never clipped by the sidebar's scroll area
 * or rounded overflow. Positioned beside the anchor and kept inside the viewport.
 */
export function Flyout({ anchor, children, onEnter, onLeave, role = 'menu', id, side = 'right', className = '' }: FlyoutProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchorEl = anchor.current;
    const panel = ref.current;
    if (!anchorEl || !panel) return;
    const rect = anchorEl.getBoundingClientRect();
    const height = panel.offsetHeight;
    if (side === 'top') { setPos({ top: Math.max(8, rect.top - height - 8), left: Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8)) }); return; }
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8));
    setPos({ top, left: Math.max(8, Math.min(rect.right + 8, window.innerWidth - panel.offsetWidth - 8)) });
  }, [anchor, children, side]);

  return createPortal(
    <div
      ref={ref}
      id={id}
      role={role}
      data-side={side}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      className={`fixed z-50 max-h-[calc(100dvh-16px)] min-w-44 max-w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-sm shadow-panel dark:border-night-border dark:bg-night-menu ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
