#!/usr/bin/env node
/**
 * README screenshots + the animated hero, from the app's sample data.
 *
 *   npm run screenshots                     build, serve on :3005, capture, stop
 *   npm run screenshots -- --url=http://localhost:3005   use a server already running
 *   options: --no-build  --lang=en|zh  --chrome=/path/to/chrome
 *
 * No dependencies: it starts the locally installed Google Chrome headless and
 * drives it over the Chrome DevTools Protocol with Node's global WebSocket
 * (Node 22), in a throwaway browser profile. Every shot opens `/?demo` — the
 * seeded, made-up household that never writes storage — except the Claude /
 * Codex card, which sample mode hides; that one opens the app fresh and skips
 * the setup, so no figures are involved. Nothing personal can end up in a
 * picture.
 *
 * Writes docs/media/{en,zh}/*.webp and docs/media/hero.svg / hero-zh.svg.
 * The only changes made to the page are cosmetic and listed here: the
 * "you're looking at sample data" banner is hidden (a real user never sees
 * it); the Plan shot hides the findings list between the metal card and the
 * chart so both fit in one picture; and the Codex card drops the local
 * build's "sync is off on this site" note. Everything else is the live UI.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildHero } from './hero-svg.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA = join(ROOT, 'docs', 'media');
const PORT = 3005;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const CHROME = args.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LANGS = args.lang ? [args.lang] : ['en', 'zh'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...m) => console.log('·', ...m);

// ---------------------------------------------------------------------------
// The strings the script clicks on, per language (from src/lib/i18n/messages.ts).
const UI = {
  en: {
    exitDemo: 'Use my own data',
    sameAsLast: 'then change what',
    plans: 'Budgets & goals',
    goalsTab: 'Savings goals',
    jar: 'Savings jar',
    onTrack: 'Am I on track?',
    review: 'Year in review',
    log: 'Log',
    report: 'Report',
    plan: 'Plan',
    data: 'Data',
    paycheck: 'Paycheck calculator',
    claude: 'Use it in Claude or Codex',
    skipSetup: 'Skip',
  },
  zh: {
    exitDemo: '用我自己的数据',
    sameAsLast: '只改变了的',
    plans: '预算与目标',
    goalsTab: '存钱目标',
    jar: '存钱罐',
    onTrack: '我跟上规划了吗',
    review: '年度回顾',
    log: '记账',
    report: '报表',
    plan: '规划',
    data: '数据',
    paycheck: '工资到手计算器',
    claude: '在 Claude 或 Codex 里用',
    skipSetup: '跳过',
  },
};

// Helpers installed in the page before each shot.
const PAGE_HELPERS = String.raw`
window.__visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
window.__btn = (t) => {
  const all = [...document.querySelectorAll('button, a, summary, [role=tab]')].filter(__visible);
  const txt = (b) => b.textContent.replace(/\s+/g, ' ').trim();
  return all.find((b) => txt(b) === t) ||
    all.filter((b) => txt(b).includes(t)).sort((a, b) => txt(a).length - txt(b).length)[0];
};
window.__click = (t) => { const b = __btn(t); if (!b) throw new Error('No button: ' + t); b.click(); return true; };
window.__card = (t) => [...document.querySelectorAll('section, dialog, .card')]
  .filter((s) => __visible(s) && s.textContent.includes(t))
  .sort((a, b) => a.textContent.length - b.textContent.length)[0] || null;
window.__rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, width: r.width, height: r.height, vy: r.top }; };
window.__scrollTo = (el, offset) => { window.scrollTo(0, el.getBoundingClientRect().top + scrollY - offset); return scrollY; };
true`;

// ---------------------------------------------------------------------------
// Chrome over CDP.
async function launchChrome() {
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME} (pass --chrome=...)`);
  const profile = mkdtempSync(join(tmpdir(), 'wo-shots-'));
  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let port;
  for (let i = 0; i < 150 && !port; i++) {
    await sleep(100);
    const f = join(profile, 'DevToolsActivePort');
    if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0];
  }
  if (!port) throw new Error('Chrome did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject, method } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(`${method}: ${m.error.message}`));
      else resolve(m.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const close = () => {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    proc.kill();
    // Chrome may still hold files for a moment.
    setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500);
  };
  return { send, close };
}

function pageApi(send) {
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    }
    return r.result.value;
  };
  const waitFor = async (expression, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await evaluate(expression).catch(() => false)) return;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  };
  const settle = () => sleep(700); // the app's fade-ins are 180 ms; charts animate a little longer

  return {
    evaluate,
    waitFor,
    settle,
    async open({ url, width, height, mobile, theme }) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile,
      });
      await send('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: theme },
          { name: 'prefers-reduced-motion', value: 'no-preference' },
        ],
      });
      await send('Page.navigate', { url });
      await waitFor('document.readyState === "complete"');
      await evaluate(PAGE_HELPERS);
      await waitFor('document.fonts.status === "loaded"');
    },
    click: async (text) => {
      await evaluate(`__click(${JSON.stringify(text)})`);
      await settle();
    },
    /** Capture a region in document coordinates, or the viewport. */
    async capture({ clip, scale = 1, quality = 88 }) {
      const metrics = await send('Page.getLayoutMetrics');
      const vp = metrics.cssVisualViewport;
      const c = clip ?? { x: 0, y: vp.pageY, width: vp.clientWidth, height: vp.clientHeight };
      const shot = await send('Page.captureScreenshot', {
        format: 'webp',
        quality,
        captureBeyondViewport: !!clip,
        clip: { ...c, scale },
      });
      return Buffer.from(shot.data, 'base64');
    },
  };
}

// ---------------------------------------------------------------------------
// The shots.
const PHONE = { width: 390, height: 844, mobile: true };
const DESKTOP = { width: 1280, height: 820, mobile: false };

/** Bounding box around elements, padded, in document coordinates. */
async function boxOf(p, selectorExprs, pad = 16) {
  const rects = [];
  for (const e of selectorExprs) rects.push(await p.evaluate(`__rect(${e})`));
  const x0 = Math.min(...rects.map((r) => r.x)) - pad;
  const y0 = Math.min(...rects.map((r) => r.y)) - pad;
  const x1 = Math.max(...rects.map((r) => r.x + r.width)) + pad;
  const y1 = Math.max(...rects.map((r) => r.y + r.height)) + pad;
  return {
    x: Math.max(0, x0),
    y: Math.max(0, y0),
    width: x1 - Math.max(0, x0),
    height: y1 - Math.max(0, y0),
  };
}

const hideDemoBanner = (s) =>
  `(() => { const b = __btn(${JSON.stringify(s.exitDemo)}); const sec = b && b.closest('section'); if (sec) sec.style.display = 'none'; return true; })()`;
const hideTabBar = `(() => { const n = document.querySelector('nav.tabbar, .tabbar'); if (n) n.style.visibility = 'hidden'; return true; })()`;
const metalRect = (scope = 'document') =>
  `(() => { const m = [...${scope}.querySelectorAll('.metal')].find(__visible); const r = m.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`;

async function openDemo(p, base, lang, device, theme) {
  await p.open({ url: `${base}/?demo&lang=${lang}`, ...device, theme });
  const s = UI[lang];
  await p.waitFor(`!!__btn(${JSON.stringify(s.exitDemo)})`);
  await p.evaluate(hideDemoBanner(s));
  await p.evaluate('window.scrollTo(0, 0)');
  await p.settle();
}

/**
 * Each shot: set up the screen, then return what to save. `frame` (a phone
 * viewport) feeds the hero animation; `file` is the README picture.
 */
const SHOTS = {
  async track(p, s) {
    // The README picture: Home, the widget board.
    await p.evaluate('window.scrollTo(0, 0)');
    await p.settle();
    const file = await p.capture({});
    // The hero: the Log tab — a new month, the "Same as last month" button
    // waiting, then tapped.
    await p.click(s.log);
    await p.evaluate('window.scrollTo(0, 0)');
    await p.settle();
    const before = await p.capture({ scale: 0.7, quality: 80 });
    const tap = await p.evaluate(
      `(() => { const r = __btn(${JSON.stringify(s.sameAsLast)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
    await p.click(s.sameAsLast);
    await p.evaluate('window.scrollTo(0, 0)');
    await p.settle();
    const after = await p.capture({ scale: 0.7, quality: 80 });
    return { file, frames: { checkinBefore: before, checkin: after }, meta: { tap } };
  },
  async onTrack(p, s) {
    const card = `__card(${JSON.stringify(s.onTrack)})`;
    await p.evaluate(`__scrollTo(document.querySelector('.metal'), 14)`);
    await p.settle();
    const frame = await p.capture({ scale: 0.7, quality: 80 });
    const metal = await p.evaluate(metalRect());
    await p.evaluate(hideTabBar);
    const file = await p.capture({
      clip: await boxOf(p, [`document.querySelector('.metal')`, card]),
    });
    return { file, frames: { onTrack: frame }, meta: { metal } };
  },
  async goals(p, s) {
    // The savings-jar widget opens Budgets & goals on the goals tab.
    await p.click(s.jar);
    const card = `__card(${JSON.stringify(s.plans)})`;
    await p.evaluate(`__scrollTo(${card}, 14)`);
    await p.settle();
    const frame = await p.capture({ scale: 0.7, quality: 80 });
    await p.evaluate(hideTabBar);
    const file = await p.capture({ clip: await boxOf(p, [card]) });
    return { file, frames: { goals: frame } };
  },
  async review(p, s) {
    await p.click(s.report);
    await p.click(s.review);
    await p.waitFor(`!!document.querySelector('dialog[open]')`);
    await p.settle();
    const frame = await p.capture({ scale: 0.7, quality: 80 });
    const reviewMetal = await p.evaluate(metalRect(`document.querySelector('dialog[open]')`));
    const r = await p.evaluate(
      `(() => { const r = document.querySelector('dialog[open]').getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, width: r.width, height: r.height }; })()`,
    );
    const pad = 12;
    const file = await p.capture({
      clip: { x: r.x - pad, y: r.y - pad, width: r.width + 2 * pad, height: r.height + 2 * pad },
    });
    return { file, frames: { review: frame }, meta: { reviewMetal } };
  },
  async plan(p, s) {
    await p.click(s.plan);
    await p.waitFor(
      `!!document.querySelector('.metal') && !!document.querySelector('.recharts-wrapper')`,
    );
    // The findings list sits between the answer and the chart; hide it so
    // both fit in one picture.
    await p.evaluate(
      `(() => { const n = document.querySelector('.metal').nextElementSibling; if (n) n.style.display = 'none'; return true; })()`,
    );
    await p.evaluate(`__scrollTo(document.querySelector('.metal'), 14)`);
    await p.settle();
    const frame = await p.capture({ scale: 0.7, quality: 80 });
    const planMetal = await p.evaluate(metalRect());
    await p.evaluate(hideTabBar);
    // The answer, the headline figure and the chart (with its caption).
    const chartBlock = `document.querySelector('.recharts-wrapper').closest('section, .card') || document.querySelector('.recharts-wrapper').parentElement.parentElement`;
    const file = await p.capture({
      clip: await boxOf(p, [`document.querySelector('.metal')`, chartBlock]),
    });
    return { file, frames: { plan: frame }, meta: { planMetal } };
  },
  async paycheck(p, s, type) {
    await p.click(s.plan);
    await p.click(s.paycheck);
    const card = `__card(${JSON.stringify(s.paycheck)})`;
    // Type a salary like a person would; California is the sample's state.
    await p.evaluate(
      `(() => { const i = ${card}.querySelector('input'); i.focus(); i.select(); return true; })()`,
    );
    await type('200000');
    await p.evaluate('document.activeElement.blur(), true');
    await p.settle();
    await p.evaluate(hideTabBar);
    // From the inputs down to the take-home figures and "use this rate"
    // (the footnote on sources stays in the app).
    const box = await boxOf(p, [card]);
    const lastButton = await p.evaluate(
      `__rect([...${card}.querySelectorAll('button')].filter(__visible).at(-1))`,
    );
    box.height = lastButton.y + lastButton.height + 20 - box.y;
    return { file: await p.capture({ clip: box }) };
  },
  async desktop(p) {
    await p.evaluate('window.scrollTo(0, 0)');
    await p.settle();
    const file = await p.capture({ quality: 82 });
    const frame = await p.capture({ scale: 0.35, quality: 78 });
    return { file, frames: { desktop: frame } };
  },
};

async function run(base) {
  const chrome = await launchChrome();
  const p = pageApi(chrome.send);
  const insertText = (text) => chrome.send('Input.insertText', { text });
  try {
    for (const lang of LANGS) {
      const s = UI[lang];
      const out = join(MEDIA, lang);
      mkdirSync(out, { recursive: true });
      const frames = {};
      const meta = {};
      const save = (name, buf) => {
        writeFileSync(join(out, `${name}.webp`), buf);
        log(`${lang}/${name}.webp`, `${Math.round(buf.length / 1024)} KB`);
      };

      for (const theme of ['dark', 'light']) {
        const suffix = theme === 'dark' ? '' : '-light';
        // Light variants only for the pictures the README swaps by theme.
        const wanted =
          theme === 'dark'
            ? ['track', 'onTrack', 'goals', 'review', 'plan', 'paycheck', 'desktop']
            : ['track', 'onTrack', 'plan', 'desktop'];
        for (const name of wanted) {
          await openDemo(p, base, lang, name === 'desktop' ? DESKTOP : PHONE, theme);
          const r = await SHOTS[name](p, s, insertText);
          const fileName = { onTrack: 'on-track' }[name] ?? name;
          save(`${fileName}${suffix}`, r.file);
          if (theme === 'dark') {
            Object.assign(frames, r.frames ?? {});
            Object.assign(meta, r.meta ?? {});
          }
        }
      }

      // Data → Use it in Claude or Codex (not shown in sample mode, so this
      // one opens the app fresh: skip the setup, open Data, pick Codex).
      for (const theme of ['dark']) {
        await p.open({ url: `${base}/?lang=${lang}`, ...PHONE, theme });
        await p.waitFor(`!!__btn(${JSON.stringify(s.skipSetup)})`);
        await p.click(s.skipSetup);
        await p.click(s.data);
        await p.waitFor(`!!__card(${JSON.stringify(s.claude)})`);
        await p.click('Codex');
        const card = `__card(${JSON.stringify(s.claude)})`;
        // A local build has sync switched off and says so under the
        // commands; the live site has it on. Leave that note out.
        await p.evaluate(
          `(() => { const n = ${card}.querySelector('pre')?.nextElementSibling; if (n) n.style.display = 'none'; return true; })()`,
        );
        await p.evaluate(`__scrollTo(${card}, 16)`);
        await p.evaluate(hideTabBar);
        await p.settle();
        save('assistants', await p.capture({ clip: await boxOf(p, [card]) }));
      }

      if (!args['no-hero']) {
        const svg = buildHero({ lang, frames, meta, phone: PHONE });
        const file = join(MEDIA, lang === 'en' ? 'hero.svg' : `hero-${lang}.svg`);
        writeFileSync(file, svg);
        log(file.replace(ROOT + '/', ''), `${Math.round(svg.length / 1024)} KB`);
      }
    }
  } finally {
    chrome.close();
  }
}

// ---------------------------------------------------------------------------
async function up(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function main() {
  if (args.url) return run(String(args.url).replace(/\/$/, ''));

  const base = `http://localhost:${PORT}`;
  if (await up(base))
    throw new Error(`Something is already serving ${base}; pass --url=${base} to use it.`);
  if (!args['no-build']) {
    log('npm run build');
    const b = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
    if (b.status !== 0) throw new Error('build failed');
  }
  log(`next start -p ${PORT}`);
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
  try {
    for (let i = 0; i < 100 && !(await up(base)); i++) await sleep(200);
    await run(base);
  } finally {
    process.kill(-server.pid);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
