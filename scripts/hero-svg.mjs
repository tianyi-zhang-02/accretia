/**
 * The README's animated hero: real phone screenshots in a device frame,
 * cross-fading with captions. Pure SVG + CSS keyframes — no script and no
 * external URLs, because GitHub shows a README's SVG through <img>, which
 * runs neither. Images are embedded as data: URIs. With
 * `prefers-reduced-motion: reduce` it is a still of the first scene.
 *
 * Used by scripts/screenshots.mjs (buildHero) — not by the app.
 */

const W = 960;
const H = 620;

const COPY = {
  en: {
    font: `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`,
    titleSize: 38,
    brand: 'Work Optional',
    foot: 'Sample data · everything runs in your browser',
    scenes: [
      {
        eyebrow: '01  Track',
        title: ['Log a month', 'in 30 seconds'],
        sub: ['One tap fills it in like last month —', 'then change only what’s different.'],
      },
      {
        eyebrow: '02  Track',
        title: ['Am I on track?'],
        sub: ['Your real net worth against the plan,', 'and what’s left for everyday spending.'],
      },
      {
        eyebrow: '03  Track',
        title: ['Goals that', 'add up'],
        sub: ['Budgets, once-a-year bills and savings', 'goals — and whether they fit.'],
      },
      {
        eyebrow: '04  Track',
        title: ['Your year,', 'in one card'],
        sub: ['Saved, best month, longest streak.', 'Hide the amounts to share it.'],
      },
      {
        eyebrow: '05  Plan',
        title: ['The year work', 'becomes optional'],
        sub: ['Your plan in today’s dollars —', 'worked out on your own device.'],
      },
    ],
  },
  zh: {
    font: `-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC', sans-serif`,
    titleSize: 40,
    brand: 'Work Optional',
    foot: '示例数据 · 全部在你的浏览器里运行',
    scenes: [
      {
        eyebrow: '01  记账',
        title: ['30 秒', '记完一个月'],
        sub: ['一键照上个月填好，', '只改变了的那几项。'],
      },
      {
        eyebrow: '02  记账',
        title: ['我跟上', '规划了吗？'],
        sub: ['真实净资产对照规划，', '还有每月日常还能花多少。'],
      },
      {
        eyebrow: '03  记账',
        title: ['预算和目标，', '心里有数'],
        sub: ['每月预算、一年一次的开支、存钱目标，', '够不够一眼看清。'],
      },
      {
        eyebrow: '04  记账',
        title: ['一年，', '一张卡片'],
        sub: ['存了多少、最好的月份、最长连续记账。', '隐藏金额，就能放心分享。'],
      },
      {
        eyebrow: '05  规划',
        title: ['哪一年，', '工作变成可选'],
        sub: ['规划按今天的钱算，', '全部在你自己的设备上完成。'],
      },
    ],
  },
};

// Timeline (seconds). Scene 0 starts on the empty month, then the tap.
const SCENES = [
  { key: 'checkin', dur: 4.6 },
  { key: 'onTrack', dur: 3.8, sheen: true },
  { key: 'goals', dur: 3.6 },
  { key: 'review', dur: 3.8, sheen: true },
  { key: 'plan', dur: 4.2, sheen: true },
];
const TAP_AT = 1.3; // seconds into scene 0
const BEFORE_UNTIL = 1.55; // the filled month fades in here
const FADE = 0.6;
const T = SCENES.reduce((s, x) => s + x.dur, 0);

// Geometry.
const PHONE = { x: 438, y: 30, w: 254, bezel: 9 };
const SCREEN_W = PHONE.w - 2 * PHONE.bezel; // 236
const STATUS = 44; // status bar height, in screenshot CSS px

const pct = (t) => `${((Math.max(0, Math.min(T, t)) / T) * 100).toFixed(3)}%`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Keyframes from [seconds, declarations] pairs (sorted, clamped to the cycle). */
function keyframes(name, points) {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  if (pts[0][0] > 0) pts.unshift([0, pts[0][1]]);
  if (pts.at(-1)[0] < T) pts.push([T, pts.at(-1)[1]]);
  return `@keyframes ${name}{${pts.map(([t, d]) => `${pct(t)}{${d}}`).join('')}}`;
}

const dataUri = (buf) => `data:image/webp;base64,${buf.toString('base64')}`;

export function buildHero({ lang, frames, meta, phone }) {
  const c = COPY[lang];
  const s = SCREEN_W / phone.width; // screenshot px → svg units
  const screenH = (phone.height + STATUS) * s;
  const sx = PHONE.x + PHONE.bezel;
  const sy = PHONE.y + PHONE.bezel;
  const phoneH = screenH + 2 * PHONE.bezel;
  const imgY = sy + STATUS * s;
  const imgH = phone.height * s;
  const map = (r) => ({
    x: sx + r.x * s,
    y: imgY + r.y * s,
    w: (r.width ?? 0) * s,
    h: (r.height ?? 0) * s,
  });

  // When does each scene start?
  let t = 0;
  const win = SCENES.map((sc) => {
    const w = { ...sc, a: t, b: t + sc.dur };
    t += sc.dur;
    return w;
  });

  // Where the metal card sits in a scene's screenshot (svg units).
  const METAL = { onTrack: 'metal', review: 'reviewMetal', plan: 'planMetal' };
  const sheenBox = (key) => {
    const r = meta[METAL[key]];
    if (!r) return null;
    const m = map(r);
    return { ...m, band: m.w * 0.32, slant: m.h * 0.35 };
  };

  const css = [];
  const anim = (cls, name, extra = '') =>
    `.${cls}{animation:${name} ${T}s linear infinite both${extra}}`;

  // Scene opacity: each new scene fades in ON TOP of the previous one, which
  // stays opaque until it is covered (no dip to the background). The last
  // scene fades out over the first, which sits underneath at the loop.
  win.forEach((w, i) => {
    const name = `s${i}`;
    let pts;
    if (i === 0) {
      pts = [
        [0, 'opacity:1'],
        [w.b + FADE, 'opacity:1'],
        [w.b + FADE + 0.01, 'opacity:0'],
      ];
    } else if (i === win.length - 1) {
      pts = [
        [0, 'opacity:1'],
        [FADE, 'opacity:0'],
        [w.a, 'opacity:0'],
        [w.a + FADE, 'opacity:1'],
      ];
    } else {
      pts = [
        [0, 'opacity:0'],
        [w.a, 'opacity:0'],
        [w.a + FADE, 'opacity:1'],
        [w.b + FADE, 'opacity:1'],
        [w.b + FADE + 0.01, 'opacity:0'],
      ];
    }
    css.push(keyframes(name, pts), anim(name, name));

    // Ken Burns: a slow push-in while the scene is on screen (the last
    // scene holds its end state while it fades out over the first).
    const kb = `kb${i}`;
    const zoomed = 'transform:scale(1.04) translateY(-5px)';
    const rest = 'transform:scale(1)';
    const last = i === win.length - 1;
    css.push(
      keyframes(kb, [
        ...(last
          ? [
              [0, zoomed],
              [FADE, zoomed],
              [FADE + 0.01, rest],
            ]
          : [[0, rest]]),
        [w.a, rest],
        [w.b + FADE, zoomed],
        ...(last ? [] : [[w.b + FADE + 0.01, rest]]),
      ]),
      anim(kb, kb, `;transform-box:view-box;transform-origin:${sx + SCREEN_W / 2}px ${imgY}px`),
    );

    // Caption: rise and fade in after the picture, out just before the next.
    const cap = `c${i}`;
    const inA = w.a + 0.25;
    const outB = w.b - 0.05;
    css.push(
      keyframes(cap, [
        [0, 'opacity:0;transform:translateY(10px)'],
        [inA, 'opacity:0;transform:translateY(10px)'],
        [inA + 0.55, 'opacity:1;transform:translateY(0)'],
        [outB - 0.35, 'opacity:1;transform:translateY(0)'],
        [outB, 'opacity:0;transform:translateY(-6px)'],
      ]),
      anim(cap, cap),
    );

    // Progress segment.
    const pg = `p${i}`;
    css.push(
      keyframes(pg, [
        [0, 'transform:scaleX(0)'],
        [w.a, 'transform:scaleX(0)'],
        [w.b, 'transform:scaleX(1)'],
        [T - 0.01, 'transform:scaleX(1)'],
        [T, 'transform:scaleX(0)'],
      ]),
      anim(pg, pg, ';transform-box:fill-box;transform-origin:left center'),
    );

    // Metal sheen: a slanted band of light sweeps across the card once.
    const m = w.sheen && sheenBox(w.key);
    if (m) {
      const sh = `h${i}`;
      const from = w.a + 0.9;
      const travel = (m.w + m.band + m.slant).toFixed(1);
      css.push(
        keyframes(sh, [
          [0, 'opacity:1;transform:translateX(0)'],
          [from, 'opacity:1;transform:translateX(0)'],
          [from + 1.4, `opacity:1;transform:translateX(${travel}px)`],
        ]),
        anim(sh, sh, ';animation-timing-function:ease-in-out'),
      );
    }
  });

  // Scene 0 has two pictures: the empty month, then filled in after the tap.
  css.push(
    keyframes('b0', [
      [0, 'opacity:1'],
      [BEFORE_UNTIL, 'opacity:1'],
      [BEFORE_UNTIL + 0.45, 'opacity:0'],
    ]),
    anim('b0', 'b0'),
    keyframes('tap', [
      [0, 'opacity:0;transform:scale(.4)'],
      [TAP_AT - 0.25, 'opacity:0;transform:scale(.4)'],
      [TAP_AT, 'opacity:.9;transform:scale(.7)'],
      [TAP_AT + 0.7, 'opacity:0;transform:scale(1.9)'],
    ]),
    anim('tap', 'tap', ';transform-box:fill-box;transform-origin:center'),
    `@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}`,
    `.float{animation:float 7s ease-in-out infinite}`,
  );

  // Base (static) state = the reduced-motion still: scene 0, filled in.
  const base = `.sc,.cap,.sheen,.tap,.b0{opacity:0}.s0,.c0{opacity:1}.pg{transform:scaleX(0)}.p0{transform:scaleX(1)}`;
  const reduced = `@media (prefers-reduced-motion: reduce){*{animation:none!important}}`;

  const font = c.font;
  const frameImg = (buf, cls = '') =>
    `<image class="${cls}" href="${dataUri(buf)}" x="${sx}" y="${imgY}" width="${SCREEN_W}" height="${imgH}" preserveAspectRatio="xMidYMin slice"/>`;

  const scenesSvg = win
    .map((w, i) => {
      const img = frames[w.key];
      if (!img) throw new Error(`hero: missing frame ${w.key}`);
      let extra = '';
      if (i === 0) {
        extra += frameImg(frames.checkinBefore, 'b0');
        const tap = map(meta.tap ?? { x: phone.width / 2, y: 300 });
        extra += `<circle class="tap" cx="${tap.x.toFixed(1)}" cy="${tap.y.toFixed(1)}" r="16" fill="#fff" fill-opacity=".35" stroke="#fff" stroke-opacity=".8" stroke-width="1.5"/>`;
      }
      const m = w.sheen && sheenBox(w.key);
      let sheen = '';
      if (m) {
        // A parallelogram starting just left of the card; the keyframes
        // slide it across. Clipped to the card, inside the Ken Burns group
        // so it stays on the card while the picture drifts.
        const id = `mc${i}`;
        const f = (n) => n.toFixed(1);
        const x0 = m.x - m.band - m.slant;
        sheen =
          `<clipPath id="${id}"><rect x="${f(m.x)}" y="${f(m.y)}" width="${f(m.w)}" height="${f(m.h)}" rx="${f(20 * s)}"/></clipPath>` +
          `<g clip-path="url(#${id})"><path class="sheen h${i}" d="M${f(x0 + m.slant)} ${f(m.y)}h${f(m.band)}l${f(-m.slant)} ${f(m.h)}h${f(-m.band)}z" fill="url(#sheen)"/></g>`;
      }
      return `<g class="sc s${i}"><g class="kb${i}">${frameImg(img)}${sheen}${extra}</g></g>`;
    })
    .join('');

  // Captions.
  const TX = 64;
  const captionsSvg = win
    .map((w, i) => {
      const sc = c.scenes[i];
      const ts = c.titleSize;
      const titleTop = 256;
      const title = sc.title
        .map((line, k) => `<tspan x="${TX}" y="${titleTop + k * (ts * 1.12)}">${esc(line)}</tspan>`)
        .join('');
      const subTop = titleTop + (sc.title.length - 1) * ts * 1.12 + 40;
      const sub = sc.sub
        .map((line, k) => `<tspan x="${TX}" y="${subTop + k * 24}">${esc(line)}</tspan>`)
        .join('');
      return `<g class="cap c${i}">
  <text x="${TX}" y="${titleTop - ts - 14}" fill="#5ee39a" font-size="13" font-weight="600" letter-spacing=".04em">${esc(sc.eyebrow)}</text>
  <text fill="#f4f6fa" font-size="${ts}" font-weight="650" letter-spacing="-.02em">${title}</text>
  <text fill="#9aa4b5" font-size="16" font-weight="400">${sub}</text>
</g>`;
    })
    .join('\n');

  const progress = win
    .map((w, i) => {
      const x = TX + i * 46;
      return `<rect x="${x}" y="524" width="38" height="3" rx="1.5" fill="#fff" fill-opacity=".14"/><rect class="pg p${i}" x="${x}" y="524" width="38" height="3" rx="1.5" fill="#e9edf5"/>`;
    })
    .join('');

  // Desktop window behind the phone.
  const D = { x: 560, y: 128, w: 372, bar: 20 };
  const dImgH = (D.w * 820) / 1280;
  const desktop = frames.desktop
    ? `<g opacity=".92">
  <rect x="${D.x - 1}" y="${D.y - 1}" width="${D.w + 2}" height="${dImgH + D.bar + 2}" rx="11" fill="#2a2f3a"/>
  <rect x="${D.x}" y="${D.y}" width="${D.w}" height="${dImgH + D.bar}" rx="10" fill="#15181e"/>
  <circle cx="${D.x + 12}" cy="${D.y + 10}" r="3.2" fill="#ff5f57" fill-opacity=".85"/><circle cx="${D.x + 23}" cy="${D.y + 10}" r="3.2" fill="#febc2e" fill-opacity=".85"/><circle cx="${D.x + 34}" cy="${D.y + 10}" r="3.2" fill="#28c840" fill-opacity=".85"/>
  <rect x="${D.x + D.w / 2 - 70}" y="${D.y + 5}" width="140" height="10" rx="5" fill="#fff" fill-opacity=".07"/>
  <clipPath id="dclip"><rect x="${D.x}" y="${D.y + D.bar}" width="${D.w}" height="${dImgH}" rx="0"/></clipPath>
  <image clip-path="url(#dclip)" href="${dataUri(frames.desktop)}" x="${D.x}" y="${D.y + D.bar}" width="${D.w}" height="${dImgH}" preserveAspectRatio="xMidYMin slice"/>
  <rect x="${D.x}" y="${D.y + D.bar}" width="${D.w}" height="${dImgH}" fill="url(#dfade)"/>
</g>`
    : '';

  const px = PHONE.x;
  const py = PHONE.y;
  const island = { w: 74, h: 21 };
  const statusY = sy + (STATUS * s) / 2 + 4;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(
    lang === 'zh'
      ? 'Work Optional 演示：30 秒记完一个月、是否跟上规划、预算和存钱目标、年度回顾、工作变成可选的那一年'
      : 'Work Optional demo: log a month in 30 seconds, see if you are on track, budgets and savings goals, your year in review, and the year work becomes optional',
  )}" font-family="${font}">
<style>
${base}
${css.join('\n')}
${reduced}
</style>
<defs>
  <radialGradient id="bg" cx="72%" cy="38%" r="85%">
    <stop offset="0" stop-color="#1c2535"/>
    <stop offset=".55" stop-color="#0f131b"/>
    <stop offset="1" stop-color="#08090c"/>
  </radialGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#4b6fa8" stop-opacity=".35"/>
    <stop offset="1" stop-color="#4b6fa8" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4a505c"/>
    <stop offset=".35" stop-color="#1d2027"/>
    <stop offset=".7" stop-color="#2c313b"/>
    <stop offset="1" stop-color="#121418"/>
  </linearGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/>
    <stop offset=".5" stop-color="#fff" stop-opacity=".34"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="dfade" x1="0" y1="0" x2="0" y2="1">
    <stop offset=".55" stop-color="#0f131b" stop-opacity="0"/>
    <stop offset="1" stop-color="#0f131b" stop-opacity=".85"/>
  </linearGradient>
  <filter id="shadow" x="-40%" y="-20%" width="180%" height="150%">
    <feGaussianBlur stdDeviation="18"/>
  </filter>
  <clipPath id="screen"><rect x="${sx}" y="${sy}" width="${SCREEN_W}" height="${screenH.toFixed(1)}" rx="34"/></clipPath>
</defs>

<rect width="${W}" height="${H}" fill="url(#bg)"/>
<ellipse cx="640" cy="300" rx="360" ry="260" fill="url(#glow)"/>
<path d="M0 ${H - 0.5}H${W}" stroke="#fff" stroke-opacity=".06"/>

<!-- Brand -->
<g transform="translate(${TX} 66)">
  <rect width="30" height="30" rx="8" fill="#f4f6fa"/>
  <text x="15" y="21" text-anchor="middle" font-size="17" font-weight="700" fill="#0b0b0c">W</text>
  <text x="42" y="21" font-size="19" font-weight="600" fill="#f4f6fa" letter-spacing="-.01em">${esc(c.brand)}</text>
</g>

${captionsSvg}

${progress}
<text x="${TX}" y="556" fill="#6d7686" font-size="12.5">${esc(c.foot)}</text>

${desktop}

<!-- Phone -->
<g class="float">
  <rect x="${px + 10}" y="${py + 34}" width="${PHONE.w - 20}" height="${phoneH - 30}" rx="44" fill="#000" opacity=".7" filter="url(#shadow)"/>
  <rect x="${px}" y="${py}" width="${PHONE.w}" height="${phoneH.toFixed(1)}" rx="43" fill="url(#frame)"/>
  <rect x="${px + 0.75}" y="${py + 0.75}" width="${PHONE.w - 1.5}" height="${(phoneH - 1.5).toFixed(1)}" rx="42.3" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1"/>
  <rect x="${px + 4}" y="${py + 4}" width="${PHONE.w - 8}" height="${(phoneH - 8).toFixed(1)}" rx="39" fill="#050506"/>
  <rect x="${px - 2}" y="${py + 110}" width="2.5" height="34" rx="1" fill="#2a2e36"/>
  <rect x="${px - 2}" y="${py + 154}" width="2.5" height="34" rx="1" fill="#2a2e36"/>
  <rect x="${px + PHONE.w - 0.5}" y="${py + 130}" width="2.5" height="56" rx="1" fill="#2a2e36"/>
  <g clip-path="url(#screen)">
    <rect x="${sx}" y="${sy}" width="${SCREEN_W}" height="${screenH.toFixed(1)}" fill="#0b0b0c"/>
    ${scenesSvg}
    <rect x="${sx}" y="${sy}" width="${SCREEN_W}" height="${(STATUS * s).toFixed(1)}" fill="#0b0b0c"/>
    <text x="${sx + 30}" y="${statusY.toFixed(1)}" fill="#f4f6fa" font-size="11.5" font-weight="600" text-anchor="middle">9:41</text>
    <rect x="${sx + SCREEN_W / 2 - island.w / 2}" y="${sy + 7}" width="${island.w}" height="${island.h}" rx="${island.h / 2}" fill="#000"/>
    <g fill="#f4f6fa" transform="translate(${sx + SCREEN_W - 58} ${(statusY - 8).toFixed(1)})">
      <rect x="0" y="6" width="2.6" height="3.4" rx=".6"/><rect x="3.8" y="4.3" width="2.6" height="5.1" rx=".6"/><rect x="7.6" y="2.5" width="2.6" height="6.9" rx=".6"/><rect x="11.4" y=".6" width="2.6" height="8.8" rx=".6"/>
      <rect x="22" y=".4" width="20" height="9.4" rx="2.6" fill="none" stroke="#f4f6fa" stroke-opacity=".5"/><rect x="23.6" y="2" width="14.5" height="6.2" rx="1.4"/><rect x="43" y="3.4" width="1.4" height="3.4" rx=".6" fill-opacity=".5"/>
    </g>
  </g>
</g>
</svg>
`;
}
