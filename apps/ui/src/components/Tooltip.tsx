import { useEffect, useRef } from 'react';

const DELAY = 300;
const GAP = 6;
const EDGE = 8;

/** One delegated tooltip for every element with `data-tip`; `data-tip-code` sets it in mono. */
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
    const place = (el: HTMLElement) => {
      const tip = ref.current;
      if (!tip || !el.isConnected || !el.dataset.tip) return;
      // A tip that repeats the text adds nothing unless the text is cut off.
      if (el.dataset.tip === el.textContent && el.scrollWidth <= el.clientWidth) return;
      tip.textContent = el.dataset.tip;
      tip.classList.toggle('code', 'tipCode' in el.dataset);
      tip.style.left = '0px';
      // Wide flex containers (the session header) hold their text far from their left edge,
      // so center on the content rather than the box.
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const content = range.getBoundingClientRect();
      const left = content.width ? Math.max(box.left, content.left) : box.left;
      const right = content.width ? Math.min(box.right, content.right) : box.right;
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      const x = Math.max(EDGE, Math.min((left + right) / 2 - w / 2, window.innerWidth - w - EDGE));
      const below = box.bottom + GAP + h < window.innerHeight - EDGE;
      tip.style.left = `${x}px`;
      tip.style.top = `${below ? box.bottom + GAP : Math.max(EDGE, box.top - h - GAP)}px`;
      tip.classList.add('show');
    };
    const show = (el: HTMLElement | null | undefined, delay: number) => {
      if (el === target) return;
      hide();
      if (!el?.dataset.tip) return;
      target = el;
      timer = setTimeout(() => place(el), delay);
    };
    const over = (e: MouseEvent) =>
      show((e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tip]'), DELAY);
    const focus = (e: FocusEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tip]');
      if (el?.matches(':focus-visible')) show(el, 0);
    };
    const out = (e: MouseEvent) => {
      if (!e.relatedTarget) hide();
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', hide);
    return () => {
      hide();
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mouseout', out);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('scroll', hide, true);
      document.removeEventListener('keydown', hide);
    };
  }, []);
  return <div ref={ref} className="tooltip" role="tooltip" />;
}
