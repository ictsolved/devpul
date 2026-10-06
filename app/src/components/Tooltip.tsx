import { useEffect, useRef } from 'react';

const DELAY = 120;

/** One delegated tooltip for every element with `data-tip`. */
export function Tooltip() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let target: HTMLElement | null = null;
    const hide = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      target = null;
      ref.current?.classList.remove('show');
    };
    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tip]');
      if (el === target) return;
      hide();
      if (!el?.dataset.tip) return;
      target = el;
      timer = setTimeout(() => {
        const tip = ref.current;
        if (!tip || !target?.isConnected) return;
        tip.textContent = target.dataset.tip ?? '';
        const r = target.getBoundingClientRect();
        tip.style.maxWidth = `${Math.min(720, window.innerWidth - 16)}px`;
        tip.classList.add('show');
        const w = tip.offsetWidth;
        const h = tip.offsetHeight;
        const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
        const below = r.bottom + 4 + h < window.innerHeight;
        tip.style.left = `${left}px`;
        tip.style.top = `${below ? r.bottom + 4 : Math.max(8, r.top - h - 4)}px`;
      }, DELAY);
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', hide);
    return () => {
      hide();
      document.removeEventListener('mouseover', over);
      document.removeEventListener('scroll', hide, true);
      document.removeEventListener('keydown', hide);
    };
  }, []);
  return <div ref={ref} className="tooltip" role="tooltip" />;
}
