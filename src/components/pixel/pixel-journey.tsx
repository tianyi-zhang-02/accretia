'use client';

import { useEffect, useMemo, useRef } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import { buildJourney, type LandmarkKind } from '@/lib/pixel/journey';
import type { YearRow } from '@/lib/simulator/engine';
import type { Assumptions } from '@/lib/validation/scenarios';

/**
 * "Pixel journey" — the projection as a tiny living world (pixtuoid-style).
 * Terrain follows real net worth; FIRE / goal / home / windfall / expense /
 * crash years appear as landmarks; a little walker crosses the horizon under
 * a sun–moon cycle, trailed by a cat. Purely decorative — the numbers are
 * the same rows the chart draws. Procedural canvas, zero dependencies, no
 * network; honors prefers-reduced-motion with a static frame.
 */

const W = 360;
const H = 96;
const GROUND_BASE = H - 14; // valley floor (h=0)
const HILL = 46; // peak rise above the floor (h=1)
const WALK_SECONDS = 36;
const SKY_CYCLE_SECONDS = 32;

type Palette = {
  dayTop: [number, number, number];
  nightTop: [number, number, number];
  grass: string;
  dirt: string;
  dirtSpeckle: string;
  sun: string;
  moon: string;
  star: string;
  cloud: string;
  skin: string;
  suit: string;
  scarf: string;
  cat: string;
  gold: string;
  house: string;
  roof: string;
  homeBody: string;
  tent: string;
  umbrella: string;
  sign: string;
  rain: string;
  storm: string;
  tipBg: string;
  tipText: string;
  tipBorder: string;
};

const DARK: Palette = {
  dayTop: [46, 58, 89],
  nightTop: [13, 17, 30],
  grass: '#4f7d5d',
  dirt: '#333d4d',
  dirtSpeckle: '#3c4759',
  sun: '#f2c14e',
  moon: '#dfe3f0',
  star: '#aeb6d0',
  cloud: '#525f7d',
  skin: '#e8d5b5',
  suit: '#8a93a6',
  scarf: '#d4a574',
  cat: '#b9bec9',
  gold: '#d4a574',
  house: '#a06a52',
  roof: '#7c4a3a',
  homeBody: '#6f88a8',
  tent: '#5f8aa8',
  umbrella: '#d97e6a',
  sign: '#9a7b4f',
  rain: '#7fa8d9',
  storm: '#454f66',
  tipBg: 'rgba(10,10,10,0.88)',
  tipText: '#f5f1ea',
  tipBorder: '#4a5568',
};

const LIGHT: Palette = {
  ...DARK,
  dayTop: [176, 214, 235],
  nightTop: [90, 96, 140],
  grass: '#79ab6d',
  dirt: '#c4a780',
  dirtSpeckle: '#b3966f',
  cloud: '#ffffff',
  star: '#f5f1ea',
  suit: '#4a4a52',
  cat: '#5f5a55',
  storm: '#8b93a8',
  tipBg: 'rgba(250,249,246,0.92)',
  tipText: '#1c1917',
  tipBorder: '#c9c2b4',
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rgb = (a: [number, number, number], b: [number, number, number], t: number) =>
  `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;

export default function PixelJourney({
  rows,
  assumptions,
  theme,
}: {
  rows: YearRow[];
  assumptions: Assumptions;
  theme: 'dark' | 'light';
}) {
  const { t, locale } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef<{ x: number; y: number } | null>(null);

  const journey = useMemo(() => buildJourney(rows, assumptions), [rows, assumptions]);
  const labels: Record<LandmarkKind, string> = t.pixel.kinds;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || journey.points.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const pal = theme === 'light' ? LIGHT : DARK;
    const pts = journey.points;
    const n = pts.length;
    const firstYear = pts[0]!.year;
    const lastYear = pts[n - 1]!.year;
    const span = Math.max(1, lastYear - firstYear);
    const yearToX = (y: number) => ((y - firstYear) / span) * (W - 1);
    const groundTop = (x: number) => {
      const fx = (x / (W - 1)) * (n - 1);
      const i = Math.min(n - 2, Math.max(0, Math.floor(fx)));
      const h = n === 1 ? pts[0]!.h : lerp(pts[i]!.h, pts[i + 1]!.h, fx - i);
      return Math.round(GROUND_BASE - h * HILL);
    };
    const fireX = (() => {
      const full = journey.landmarks.find((l) => l.kind === 'full');
      return full ? yearToX(full.year) : Infinity;
    })();
    const money = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    // Deterministic star field.
    const stars = Array.from({ length: 26 }, (_, i) => ({
      x: (i * 137) % W,
      y: ((i * 71) % 34) + 3,
    }));

    const px = (x: number, y: number, c: string, w = 1, h = 1) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    };

    const drawLandmark = (kind: LandmarkKind, x: number, gy: number, time: number) => {
      switch (kind) {
        case 'full': // house with a gold flag — work is optional here
          px(x - 3, gy - 4, pal.house, 6, 4);
          px(x - 4, gy - 5, pal.roof, 8, 1);
          px(x - 3, gy - 6, pal.roof, 6, 1);
          px(x - 1, gy - 2, pal.roof, 1, 2);
          px(x + 4, gy - 11, pal.sign, 1, 7);
          px(x + 5, gy - 11, pal.gold, 3, 2);
          break;
        case 'goal': // a lone gold flag
          px(x, gy - 9, pal.sign, 1, 9);
          px(x + 1, gy - 9, pal.gold, 3, 2);
          break;
        case 'home': // the mortgage house
          px(x - 3, gy - 4, pal.homeBody, 6, 4);
          px(x - 4, gy - 5, pal.roof, 8, 1);
          px(x - 2, gy - 2, pal.roof, 1, 2);
          break;
        case 'lean': // a tent
          px(x - 1, gy - 4, pal.tent, 2, 1);
          px(x - 2, gy - 3, pal.tent, 4, 1);
          px(x - 3, gy - 2, pal.tent, 6, 2);
          break;
        case 'coast': // beach umbrella
          px(x, gy - 7, pal.sign, 1, 7);
          px(x - 3, gy - 8, pal.umbrella, 7, 1);
          px(x - 2, gy - 9, pal.umbrella, 5, 1);
          break;
        case 'windfall': // treasure chest
          px(x - 2, gy - 3, pal.gold, 4, 3);
          px(x - 2, gy - 2, pal.roof, 4, 1);
          break;
        case 'expense': // signpost
          px(x, gy - 6, pal.sign, 1, 6);
          px(x - 2, gy - 6, pal.sign, 5, 2);
          break;
        case 'crash': {
          // storm cloud + rain, parked over its year
          px(x - 4, gy - 22, pal.storm, 9, 3);
          px(x - 2, gy - 24, pal.storm, 5, 2);
          for (let k = 0; k < 4; k += 1) {
            const ry = gy - 18 + ((time * 26 + k * 5) % 14);
            px(x - 3 + k * 2, ry, pal.rain, 1, 2);
          }
          break;
        }
      }
    };

    let raf = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const render = (time: number) => {
      // --- sky: sun for the first half of the cycle, moon for the second ---
      const phase = (time % SKY_CYCLE_SECONDS) / SKY_CYCLE_SECONDS;
      const daylight = phase < 0.5 ? Math.sin(Math.PI * (phase * 2)) : 0;
      ctx.fillStyle = rgb(pal.nightTop, pal.dayTop, daylight);
      ctx.fillRect(0, 0, W, H);
      if (daylight < 0.35) for (const s of stars) px(s.x, s.y, pal.star);
      const p = phase < 0.5 ? phase * 2 : (phase - 0.5) * 2;
      const bx = 10 + p * (W - 20);
      const by = 34 - Math.sin(Math.PI * p) * 26;
      if (phase < 0.5) {
        px(bx - 1, by - 1, pal.sun, 4, 4);
        px(bx, by - 2, pal.sun, 2, 6);
        px(bx - 2, by, pal.sun, 6, 2);
      } else {
        px(bx, by, pal.moon, 3, 3);
        px(bx + 1, by, pal.nightTop === DARK.nightTop ? '#1d2438' : '#8b93b8', 1, 1);
      }
      // clouds drift
      for (let c = 0; c < 3; c += 1) {
        const cx = ((c * 120 + time * (3 + c)) % (W + 30)) - 15;
        const cy = 12 + c * 9;
        px(cx, cy, pal.cloud, 10, 2);
        px(cx + 2, cy - 1, pal.cloud, 6, 1);
      }

      // --- terrain ---
      for (let x = 0; x < W; x += 1) {
        const gy = groundTop(x);
        px(x, gy, pal.grass, 1, 2);
        px(x, gy + 2, pal.dirt, 1, H - gy - 2);
        if ((x * 7 + gy * 13) % 37 === 0) px(x, gy + 5, pal.dirtSpeckle, 1, 1);
      }

      // --- landmarks (same-year ones nudge right so nothing overlaps) ---
      const seen = new Map<number, number>();
      for (const l of journey.landmarks) {
        const bump = seen.get(l.year) ?? 0;
        seen.set(l.year, bump + 1);
        const x = Math.min(W - 6, Math.max(5, yearToX(l.year) + bump * 9));
        drawLandmark(l.kind, x, groundTop(x), time);
      }

      // --- walker (+ scarf and sparkles once past full FIRE) ---
      const wp = (time % WALK_SECONDS) / WALK_SECONDS;
      const cx = 4 + wp * (W - 10);
      const gy = groundTop(cx);
      const step = Math.floor(time * 4) % 2;
      const free = cx >= fireX;
      px(cx, gy - 8, pal.skin, 2, 2); // head
      if (free) px(cx, gy - 6, pal.scarf, 2, 1); // the FIRE scarf
      px(cx - 1, gy - (free ? 5 : 6), pal.suit, 4, 3); // body
      px(cx - 1 + step, gy - 3, pal.suit, 1, 3); // legs
      px(cx + 1 + (1 - step), gy - 3, pal.suit, 1, 3);
      if (free && Math.floor(time * 2) % 3 === 0) {
        px(cx + ((Math.floor(time * 5) % 5) - 2), gy - 12, pal.gold, 1, 1); // sparkle
      }

      // --- the cat, a few steps behind ---
      const catX = cx - 9;
      if (catX > 1) {
        const cgy = groundTop(catX);
        px(catX, cgy - 2, pal.cat, 4, 2); // body
        px(catX + 3, cgy - 3, pal.cat, 1, 1); // head
        px(catX + 3, cgy - 4, pal.cat, 1, 1); // ear
        px(catX - 1, cgy - 3 + (step ? 0 : -1), pal.cat, 1, 1); // tail flick
      }

      // --- hover: year marker + tooltip ---
      const m = mouse.current;
      if (m) {
        const i = Math.min(n - 1, Math.max(0, Math.round((m.x / (W - 1)) * (n - 1))));
        const pt = pts[i]!;
        const mx = (i / Math.max(1, n - 1)) * (W - 1);
        ctx.fillStyle = pal.tipBorder;
        ctx.fillRect(Math.round(mx), 6, 1, H - 6 - (H - groundTop(mx)));
        const here = journey.landmarks.filter((l) => l.year === pt.year).map((l) => labels[l.kind]);
        const lines = [`${pt.year} · $${money.format(pt.real)}`, ...here];
        ctx.font = '8px ui-monospace, monospace';
        const wMax = Math.max(...lines.map((s) => ctx.measureText(s).width));
        const bw = wMax + 8;
        const bx2 = Math.min(W - bw - 2, Math.max(2, mx + 4));
        ctx.fillStyle = pal.tipBg;
        ctx.fillRect(bx2, 4, bw, lines.length * 10 + 6);
        ctx.strokeStyle = pal.tipBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx2 + 0.5, 4.5, bw - 1, lines.length * 10 + 5);
        ctx.fillStyle = pal.tipText;
        lines.forEach((s, k) => ctx.fillText(s, bx2 + 4, 13 + k * 10));
      }
    };

    const loop = (now: number) => {
      render(now / 1000);
      raf = requestAnimationFrame(loop);
    };
    if (reduced) {
      render(SKY_CYCLE_SECONDS * 0.25); // static mid-morning frame
    } else {
      raf = requestAnimationFrame(loop);
    }

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current = {
        x: ((e.clientX - rect.left) / rect.width) * W,
        y: ((e.clientY - rect.top) / rect.height) * H,
      };
      if (reduced) render(SKY_CYCLE_SECONDS * 0.25);
    };
    const onLeave = () => {
      mouse.current = null;
      if (reduced) render(SKY_CYCLE_SECONDS * 0.25);
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, [journey, theme, locale, labels]);

  if (journey.points.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      role="img"
      aria-label={t.pixel.caption}
      className="border-border w-full rounded border"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
