'use client';

import { useEffect, useRef } from 'react';

/**
 * The guide — the same little pixel walker from the journey strip, here as
 * your host for the setup questions. Idles, blinks, and waves; purely
 * decorative, drawn procedurally like the rest of the pixel art (no images,
 * no network). Honors prefers-reduced-motion with a still frame.
 */

const W = 24;
const H = 28;

export default function PixelGuide({ theme, step }: { theme: 'dark' | 'light'; step: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;

    const pal =
      theme === 'light'
        ? { skin: '#e8d5b5', suit: '#4a4a52', scarf: '#d4a574', eye: '#1c1917', spark: '#c9a227' }
        : { skin: '#e8d5b5', suit: '#8a93a6', scarf: '#d4a574', eye: '#20242e', spark: '#d4a574' };

    const px = (x: number, y: number, c: string, w = 1, h = 1) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };

    const render = (time: number) => {
      ctx.clearRect(0, 0, W, H);
      // Gentle idle bob, and a wave that fires on each new question.
      const bob = Math.floor(time * 1.6) % 2;
      const waving = time % 4 < 1.1;
      const wave = waving && Math.floor(time * 6) % 2 === 0;
      const y = 6 + bob;

      px(9, y, pal.skin, 6, 5); // head
      px(8, y + 1, pal.skin, 1, 3);
      px(15, y + 1, pal.skin, 1, 3);
      // eyes — blink on a slow, uneven beat so it feels alive
      if (Math.floor(time * 0.9) % 7 !== 0) {
        px(10, y + 2, pal.eye, 1, 1);
        px(13, y + 2, pal.eye, 1, 1);
      } else {
        px(10, y + 3, pal.eye, 1, 1);
        px(13, y + 3, pal.eye, 1, 1);
      }
      px(9, y + 5, pal.scarf, 6, 2); // scarf
      px(9, y + 7, pal.suit, 6, 7); // body
      px(8, y + 8, pal.suit, 1, 4); // far arm
      // near arm: raised in a wave, or resting
      if (wave) {
        px(15, y + 5, pal.suit, 1, 4);
        px(16, y + 4, pal.skin, 1, 1);
      } else {
        px(15, y + 8, pal.suit, 1, 4);
      }
      px(9, y + 14, pal.suit, 2, 3); // legs
      px(13, y + 14, pal.suit, 2, 3);
      if (wave) px(18, y + 2, pal.spark, 1, 1); // a little spark of enthusiasm
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      render(2);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      render((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // `step` restarts the animation so the guide waves at each new question.
  }, [theme, step]);

  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      aria-hidden
      className="shrink-0"
      style={{ width: W * 2, height: H * 2, imageRendering: 'pixelated' }}
    />
  );
}
