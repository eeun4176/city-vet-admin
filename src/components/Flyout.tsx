import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface FlyoutProps {
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  onEnter: () => void;
  onLeave: () => void;
  role?: 'tooltip' | 'menu';
  id?: string;
}

/**
 * Rendered through a Portal so it is never clipped by the sidebar's scroll area
 * or rounded overflow. Positioned beside the anchor and kept inside the viewport.
 */
export function Flyout({ anchor, children, onEnter, onLeave, role = 'menu', id }: FlyoutProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchorEl = anchor.current;
    const panel = ref.current;
    if (!anchorEl || !panel) return;
    const rect = anchorEl.getBoundingClientRect();
    const height = panel.offsetHeight;
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8));
    setPos({ top, left: rect.right + 8 });
  }, [anchor, children]);

  return createPortal(
    <div
      ref={ref}
      id={id}
      role={role}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      className="fixed z-50 max-h-[calc(100dvh-16px)] min-w-44 max-w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-sm shadow-panel dark:border-slate-700 dark:bg-surface-dark"
    >
      {children}
    </div>,
    document.body,
  );
}
