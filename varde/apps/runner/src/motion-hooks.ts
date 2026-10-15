// Screen and bar motion for Preact: content enters in a short stagger, buttons glide when the set changes (FLIP).
import type { RefObject } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { animate, ease, reduced, stagger } from '@varde/ui/motion';

/** New screen: `.anim` children slide in from the direction of travel. Content is visible at rest; motion only on the way in. */
export function useEnter(root: RefObject<HTMLElement>, key: string, dir: number): void {
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = root.current;
    if (!el || reduced()) return;
    void stagger(
      el.querySelectorAll('.anim'),
      [
        { opacity: 0, transform: `translateX(${dir * 26}px)` },
        { opacity: 1, transform: 'none' },
      ],
      {
        duration: 440,
        easing: ease.inn,
        step: 34,
        max: 8,
        fill: 'backwards',
      },
    );
    if (window.scrollY > 40) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [key]);
}

/** Buttons that stay glide to their new place with a spring; new ones rise in. */
export function useFlip(root: RefObject<HTMLElement>, key: string): void {
  const rects = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const before = rects.current,
      after = new Map<string, DOMRect>();
    const buttons = [...el.querySelectorAll<HTMLElement>('[data-flip]')];
    buttons.forEach((b, k) => {
      const id = b.dataset['flip']!,
        r = b.getBoundingClientRect(),
        old = before.get(id);
      after.set(id, r);
      if (reduced() || before.size === 0) return;
      if (!old) {
        void animate(
          b,
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'none' },
          ],
          {
            duration: 380,
            delay: 80 + k * 50,
            easing: ease.inn,
            fill: 'backwards',
          },
        );
        return;
      }
      const dx = old.left - r.left,
        dy = old.top - r.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)
        void animate(b, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
          duration: 560,
          easing: ease.fjor,
          fill: 'none',
        });
    });
    rects.current = after;
  }, [key]);
}
