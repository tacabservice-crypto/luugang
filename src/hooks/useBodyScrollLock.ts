import { useEffect } from 'react';

let activeLocks = 0;
let lockedScrollY = 0;
let originalBodyStyles: Partial<CSSStyleDeclaration> | null = null;

export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active || typeof window === 'undefined') return;

    const body = document.body;
    activeLocks += 1;
    if (activeLocks === 1) {
      lockedScrollY = window.scrollY;
      originalBodyStyles = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflow: body.style.overflow,
      };
      body.style.position = 'fixed';
      body.style.top = `-${lockedScrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
    }

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);
      if (activeLocks !== 0 || !originalBodyStyles) return;
      const saved = originalBodyStyles;
      originalBodyStyles = null;
      body.style.position = saved.position || '';
      body.style.top = saved.top || '';
      body.style.left = saved.left || '';
      body.style.right = saved.right || '';
      body.style.width = saved.width || '';
      body.style.overflow = saved.overflow || '';
      window.scrollTo(0, lockedScrollY);
    };
  }, [active]);
}
