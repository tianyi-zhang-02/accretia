'use client';

import { useEffect, useMemo, useRef } from 'react';

import { useI18n } from '@/lib/i18n/locale';
import { buildJourney, type Landmark, type LandmarkKind } from '@/lib/pixel/journey';
import type { YearRow } from '@/lib/simulator/engine';
import type { Assumptions } from '@/lib/validation/scenarios';

export type PixelScene = 'meadow' | 'seaside' | 'snow';

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
  car: string;
  water: string;
  sail: string;
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
  car: '#c25b4e',
  water: '#3d6e9e',
  sail: '#e8e0d0',
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
  water: '#5b93c4',
  tipBg: 'rgba(250,249,246,0.92)',
  tipText: '#1c1917',
  tipBorder: '#c9c2b4',
};

/** Scene reskins (pixtuoid-style palettes): sand for seaside, white for snow. */
const SCENE_OVERRIDES: Record<PixelScene, { dark: Partial<Palette>; light: Partial<Palette> }> = {
  meadow: { dark: {}, light: {} },
  seaside: {
    dark: { grass: '#8f7b52', dirt: '#4a4030', dirtSpeckle: '#5a4e3a' },
    light: { grass: '#e0c98f', dirt: '#c9ad7a', dirtSpeckle: '#b89a63' },
  },
  snow: {
    dark: { grass: '#c8d2e0', dirt: '#3a4354', dirtSpeckle: '#4a5468' },
    light: { grass: '#eef2f8', dirt: '#b5bfce', dirtSpeckle: '#a2adc0' },
  },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rgb = (a: [number, number, number], b: [number, number, number], t: number) =>
  `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;

export default function PixelJourney({
  rows,
  assumptions,
  theme,
  scene = 'meadow',
}: {
  rows: YearRow[];
  assumptions: Assumptions;
  theme: 'dark' | 'light';
  scene?: PixelScene;
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

    const pal: Palette = {
      ...(theme === 'light' ? LIGHT : DARK),
      ...SCENE_OVERRIDES[scene][theme],
    };
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

    const drawLandmark = (l: Pick<Landmark, 'kind' | 'tier'>, x: number, gy: number, time: number) => {
      switch (l.kind) {
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
        case 'home': {
          // A home, sized by price: ~1M bungalow / ~3M two-story / 5M+ mansion.
          const tier = l.tier ?? 1;
          if (tier === 1) {
            px(x - 3, gy - 4, pal.homeBody, 6, 4);
            px(x - 4, gy - 5, pal.roof, 8, 1);
            px(x - 2, gy - 2, pal.roof, 1, 2);
          } else if (tier === 2) {
            px(x - 3, gy - 8, pal.homeBody, 7, 8);
            px(x - 4, gy - 9, pal.roof, 9, 1);
            px(x - 3, gy - 10, pal.roof, 7, 1);
            px(x - 2, gy - 6, pal.gold, 1, 1); // upstairs window
            px(x + 2, gy - 6, pal.gold, 1, 1);
            px(x, gy - 2, pal.roof, 1, 2); // door
          } else {
            // mansion: two wings + a taller center hall, gold door
            px(x - 7, gy - 5, pal.homeBody, 5, 5);
            px(x + 2, gy - 5, pal.homeBody, 5, 5);
            px(x - 3, gy - 9, pal.homeBody, 6, 9);
            px(x - 8, gy - 6, pal.roof, 7, 1);
            px(x + 1, gy - 6, pal.roof, 7, 1);
            px(x - 4, gy - 10, pal.roof, 8, 1);
            px(x - 2, gy - 7, pal.gold, 1, 1);
            px(x + 1, gy - 7, pal.gold, 1, 1);
            px(x - 1, gy - 3, pal.gold, 2, 3); // grand door
          }
          break;
        }
        case 'car': // a little car (the 911 fund, perhaps)
          px(x - 3, gy - 3, pal.car, 7, 2);
          px(x - 1, gy - 4, pal.car, 3, 1);
          px(x, gy - 4, pal.sail, 1, 1); // windshield glint
          px(x - 2, gy - 1, pal.suit, 1, 1); // wheels
          px(x + 2, gy - 1, pal.suit, 1, 1);
          break;
        case 'boat': {
          // a yacht on its own patch of water, gently bobbing
          const bob = Math.floor(time * 2) % 2;
          px(x - 6, gy, pal.water, 13, 2);
          px(x - 3, gy - 2 - bob, pal.sign, 6, 2); // hull
          px(x, gy - 7 - bob, pal.sign, 1, 5); // mast
          px(x + 1, gy - 7 - bob, pal.sail, 3, 2); // sail
          px(x + 1, gy - 5 - bob, pal.sail, 2, 1);
          break;
        }
        case 'travel': // a packed suitcase (a plane also crosses the sky)
          px(x - 1, gy - 3, pal.roof, 4, 3);
          px(x, gy - 4, pal.roof, 2, 1);
          px(x, gy - 2, pal.gold, 2, 1); // strap
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

    const hasTravel = journey.landmarks.some((l) => l.kind === 'travel');
    const overcastX = journey.overcast
      ? {
          x1: Math.max(0, yearToX(journey.overcast.fromYear) - 2),
          x2: Math.min(W, yearToX(journey.overcast.toYear) + 6),
        }
      : null;
    // Seaside scene: a little bay at the lowest point of the terrain.
    const bayX = (() => {
      if (scene !== 'seaside') return null;
      let mi = 0;
      journey.points.forEach((p, i) => {
        if (p.h < journey.points[mi]!.h) mi = i;
      });
      return Math.min(W - 24, Math.max(12, yearToX(journey.points[mi]!.year)));
    })();

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

      // job-loss stress: an overcast stretch — dimmed sky + parked grey clouds
      if (overcastX) {
        ctx.fillStyle = theme === 'light' ? 'rgba(90,96,110,0.18)' : 'rgba(8,10,16,0.35)';
        ctx.fillRect(overcastX.x1, 0, overcastX.x2 - overcastX.x1, GROUND_BASE - HILL);
        for (let gx = overcastX.x1 + 4; gx < overcastX.x2 - 6; gx += 16) {
          px(gx, 15, pal.storm, 11, 3);
          px(gx + 2, 13, pal.storm, 6, 2);
        }
      }

      // any travel plans → a plane crosses the sky, contrail and all
      if (hasTravel) {
        const pxX = ((time * 24) % (W + 90)) - 45;
        px(pxX, 8, pal.sail, 6, 1); // fuselage
        px(pxX + 5, 7, pal.sail, 1, 1); // nose-up tailfin
        px(pxX + 2, 9, pal.sail, 2, 1); // wing
        for (let k = 1; k <= 3; k += 1) px(pxX - 2 - k * 4, 8, pal.cloud, 2, 1); // contrail
      }

      // --- terrain ---
      for (let x = 0; x < W; x += 1) {
        const gy = groundTop(x);
        px(x, gy, pal.grass, 1, 2);
        px(x, gy + 2, pal.dirt, 1, H - gy - 2);
        if ((x * 7 + gy * 13) % 37 === 0) px(x, gy + 5, pal.dirtSpeckle, 1, 1);
      }

      // seaside scene: a bay at the lowest point, with a sailboat at anchor
      if (bayX !== null) {
        const by2 = groundTop(bayX);
        const bob = Math.floor(time * 2) % 2;
        px(bayX - 10, by2, pal.water, 21, 2);
        px(bayX - 8, by2 + 1 + ((Math.floor(time * 3) + 1) % 2), pal.sail, 2, 1); // glint
        px(bayX - 2, by2 - 2 - bob, pal.sign, 5, 2);
        px(bayX, by2 - 6 - bob, pal.sign, 1, 4);
        px(bayX + 1, by2 - 6 - bob, pal.sail, 2, 2);
      }

      // --- landmarks (same-year ones nudge right so nothing overlaps) ---
      const seen = new Map<number, number>();
      for (const l of journey.landmarks) {
        const bump = seen.get(l.year) ?? 0;
        seen.set(l.year, bump + 1);
        const x = Math.min(W - 8, Math.max(8, yearToX(l.year) + bump * 11));
        drawLandmark(l, x, groundTop(x), time);
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

      // snow scene: gentle foreground snowfall
      if (scene === 'snow') {
        for (let f = 0; f < 18; f += 1) {
          const fx = (f * 89 + Math.floor(time) * 7) % W;
          const fy = (time * (9 + (f % 4)) + f * 23) % (H - 4);
          px(fx, fy, pal.sail, 1, 1);
        }
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
  }, [journey, theme, scene, locale, labels]);

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
