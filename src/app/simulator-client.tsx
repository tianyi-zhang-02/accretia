'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import GuidedSetup from '@/components/agent/guided-setup';
import ClaudeCard from '@/components/data/claude-card';
import DataCard, { downloadBackup } from '@/components/data/data-card';
import Icon, { SectionLabel } from '@/components/ui/icon';
import InsightsPanel from '@/components/agent/insights-panel';
import MonteCarloChart from '@/components/charts/montecarlo-chart';
import SimulatorChart, { type DisplayMode, type Marker } from '@/components/charts/simulator-chart';
import LedgerPanel from '@/components/ledger/ledger-panel';
import AssumptionsForm from '@/components/simulator/assumptions-form';
import PaycheckCalculator from '@/components/simulator/paycheck-calculator';
import PlanSummary from '@/components/simulator/plan-summary';
import CompareView, { type ComparableScenario } from '@/components/simulator/compare-view';
import { defaultAssumptions, newId } from '@/components/simulator/default-assumptions';
import PixelJourney, { type PixelScene } from '@/components/pixel/pixel-journey';
import FirePanel from '@/components/simulator/fire-panel';
import GoalSeekPanel from '@/components/simulator/goal-seek-panel';
import StressPanel from '@/components/simulator/stress-panel';
import YearTable from '@/components/simulator/year-table';
import { CLOUD } from '@/lib/cloud/config';
import { sampleData } from '@/lib/demo/sample';
import { LocaleProvider, useI18n } from '@/lib/i18n/locale';
import { ledgerSchema, type MonthEntry } from '@/lib/ledger/ledger';
import { simulate } from '@/lib/simulator/engine';
import { fireHeadline } from '@/lib/simulator/insights';
import { useAppBadge } from '@/components/pwa/app-badge';
import InstallCard, { useInstallState } from '@/components/pwa/install-card';
import UpdateBanner from '@/components/pwa/update-banner';
import SettingsMenu, { type ThemePref } from '@/components/ui/settings-menu';
import Toast, { type ToastMessage } from '@/components/ui/toast';
import { BACKUP_STALE_DAYS, daysSince } from '@/lib/backup/backup';
import { runMonteCarlo } from '@/lib/simulator/montecarlo';
import { assumptionsSchema, type Assumptions } from '@/lib/validation/scenarios';

/**
 * Wealth-projection simulator — the entire app.
 *
 * Purely client-side. There is no backend, no database, no auth, and
 * nothing is ever sent anywhere:
 *
 *   - Scenarios live in this component's React state, mirrored to ONE
 *     localStorage key on the user's own device (see STORAGE_KEY) so the
 *     app behaves like an app. That mirror is a checkbox — untick "Save on
 *     this device" and the key is erased immediately. No cookies, no
 *     server, no network: the data never leaves the browser either way.
 *   - Persistence is by file: "Export JSON" downloads the current scenario
 *     as a `.json`; "Import JSON" reads one back in. Both are pure browser
 *     APIs — no network call.
 *   - Language is held in the `?lang` URL param (see LocaleProvider) — also
 *     no storage.
 *
 * The only dependencies are the pure simulation engine, the simulator UI
 * components, the chart, and the `Assumptions` zod schema (used to validate
 * imported files). No network-touching module exists in the app at all.
 */

/**
 * Trigger a client-side JSON download of the given scenario. Uses Blob +
 * URL.createObjectURL — pure browser API, no network call.
 */
function downloadScenarioJson(name: string, assumptions: Assumptions): void {
  const payload = JSON.stringify({ name, assumptions }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Slugify the scenario name for the filename. Keep it readable but safe.
  // Non-ASCII (e.g. Chinese) names collapse away, so fall back to a default.
  const slug = (name || 'scenario')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  a.download = `${slug || 'scenario'}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke async so the browser has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Account + encrypted sync. Loaded lazily and ONLY when the deployment is
 * configured for it, so an unconfigured build never ships or runs the
 * network code at all.
 */
const CloudSync = dynamic(() => import('@/components/data/cloud-sync'), { ssr: false });

/**
 * Local persistence — ON by default, so the app is still your app tomorrow.
 * Scenarios live under this ONE localStorage key, on the user's device only
 * (nothing is ever sent anywhere); unticking "Save on this device" erases it
 * and drops back to memory-only. Restored data is validated against
 * `assumptionsSchema` like any other untrusted input.
 */
const STORAGE_KEY = 'workoptional:saved:v1';
/**
 * The monthly ledger — the second (and last) approved key. Same rules as the
 * plan: device-only, schema-validated on restore, governed by the same
 * checkbox and erased with it. It's separate from the scenarios because
 * actuals are reality, not a what-if: they don't fork per scenario.
 */
const LEDGER_KEY = 'workoptional:ledger:v1';
/** Pre-rename key. Read once so an existing plan survives the rename. */
const LEGACY_STORAGE_KEY = 'accretia:saved:v1';

/** Public entry — provides the locale context to the whole app. */
export default function SimulatorClient() {
  return (
    <LocaleProvider>
      <SimulatorInner />
    </LocaleProvider>
  );
}

function SimulatorInner() {
  const { t, fmt, locale, setLocale } = useI18n();

  // Scenarios. Nothing is ever written to a server; they're mirrored to this
  // device's localStorage while "Save on this device" is ticked (see
  // STORAGE_KEY), and exportable to a file either way.
  const [scenarios, setScenarios] = useState<ComparableScenario[]>(() => [
    { id: newId(), name: t.scenarioBar.defaultName(1), assumptions: defaultAssumptions() },
  ]);
  const [selectedId, setSelectedId] = useState<string>(() => scenarios[0]!.id);
  // Today's dollars by default: the headline figure is in them, and a nominal
  // line decades out reads as a fantasy.
  const [displayMode, setDisplayMode] = useState<DisplayMode>('real');
  // Deterministic band vs probabilistic Monte-Carlo fan (a chart-level switch).
  const [chartEngine, setChartEngine] = useState<'deterministic' | 'probabilistic'>(
    'deterministic',
  );
  const [volatilityPct, setVolatilityPct] = useState(15);

  // Display preferences. They ride inside the scenarios blob (like
  // lastBackupAt) — no extra storage key. 'system' follows the OS setting.
  const [themePref, setThemePref] = useState<ThemePref>('system');
  const [fontScale, setFontScale] = useState(1);
  const systemDark = useSyncExternalStore(subscribeColorScheme, prefersDark, () => true);
  const theme: 'dark' | 'light' =
    themePref === 'system' ? (systemDark ? 'dark' : 'light') : themePref;
  const [guiding, setGuiding] = useState(false);
  // One panel, three views — the home screen keeps to a single visual.
  const [view, setView] = useState<'chart' | 'world' | 'table'>('chart');
  // Top-level sections. Tracking is home: the projection is one part of the
  // app, the yardstick the monthly numbers are held against.
  const [tab, setTab] = useState<'track' | 'plan' | 'data'>('track');
  const [managing, setManaging] = useState(false);
  // The Data section stays mounted (hidden) once opened, so the sync panel
  // keeps its unlocked key and its auth listener while you use other tabs.
  // It is NOT mounted before that: a visitor who never opens it never loads
  // the network code.
  const [dataMounted, setDataMounted] = useState(false);
  // Opened from a sign-in email? ('ok' = the link carried a session,
  // 'failed' = it was expired or already used.)
  const [arrival, setArrival] = useState<'ok' | 'failed' | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  // The browser refused the last write (private mode, storage full).
  const [storageError, setStorageError] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const notify = useCallback(
    (text: string, undo?: () => void) => setToast({ id: Date.now(), text, undo }),
    [],
  );
  const clearToast = useCallback(() => setToast(null), []);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  // Set when state was just adopted FROM storage (another tab wrote it), so
  // the persist effect doesn't echo it straight back.
  const adopting = useRef(false);
  const install = useInstallState();

  function openData() {
    setDataMounted(true);
    setTab('data');
    window.scrollTo({ top: 0 });
  }

  // Arriving from the sign-in email: go straight to the account panel rather
  // than leaving someone on the home screen wondering whether it worked.
  useEffect(() => {
    if (!CLOUD) return;
    const id = window.setTimeout(() => {
      const { hash, search, pathname } = window.location;
      const params = `${hash}&${search}`;
      if (!/[#&?](access_token|code|error|error_code)=/.test(params)) return;
      const failed = /[#&?]error(_code)?=/.test(params);
      setArrival(failed ? 'failed' : 'ok');
      setDataMounted(true);
      setTab('data');
      if (failed) {
        // Nothing will consume a dead link's parameters — tidy the address
        // bar ourselves, keeping only the language choice.
        const lang = new URLSearchParams(search).get('lang');
        window.history.replaceState(null, '', pathname + (lang ? `?lang=${lang}` : ''));
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  const [ledger, setLedger] = useState<MonthEntry[]>([]);
  // When the last whole-app backup was downloaded. Rides inside the plan's
  // storage blob — NOT a third key — so the two-key rule still holds.
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [pixelScene, setPixelScene] = useState<PixelScene>('meadow');
  // On by default so the app behaves like an app — your plan is still there
  // tomorrow. It never leaves the device (single localStorage key), and one
  // untick erases it. See STORAGE_KEY above.
  const [saveLocal, setSaveLocal] = useState(true);

  // Nothing may be WRITTEN to storage until the restore attempt has finished.
  // Without this gate the persist effect (now on by default) fires first on
  // mount and overwrites a saved session with the blank default scenario.
  const hydrated = useRef(false);
  // "Try it with sample data": the person's own plan and ledger wait here
  // while a sample household is shown. Nothing is written to storage, no
  // other tab is adopted, and backup / restore / sync are out of reach until
  // they leave — the sample can never land in their data.
  const [demo, setDemo] = useState<null | {
    scenarios: ComparableScenario[];
    selectedId: string;
    ledger: MonthEntry[];
    guiding: boolean;
  }>(null);
  const [wantDemo, setWantDemo] = useState(false);
  // On a touch screen, mark the page while a text field has focus so CSS can
  // move the tab bar out of the keyboard's way (see `[data-typing]`).
  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      el.matches('input:not([type=checkbox]):not([type=radio]), textarea');
    const root = document.documentElement;
    const onIn = (e: FocusEvent) => {
      if (isField(e.target) && window.matchMedia('(pointer: coarse)').matches) {
        root.dataset.typing = '';
      }
    };
    const onOut = () => {
      // Focus moving to the next field fires focusout first: check after it lands.
      window.setTimeout(() => {
        if (!isField(document.activeElement)) delete root.dataset.typing;
      }, 0);
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
      delete root.dataset.typing;
    };
  }, []);
  // Leaving the sample puts back exactly what storage already holds — so the
  // write that follows is skipped (a first visitor must not get a blank plan
  // saved, or the guided setup wouldn't open next time).
  const skipPersist = useRef(false);
  useAppBadge(demo ? demo.ledger : ledger);

  /**
   * Read the saved plan, ledger and preferences from this device and adopt
   * them. Used once on mount, and again whenever ANOTHER tab or window of the
   * app writes — otherwise two open windows would silently overwrite each
   * other. Returns false when nothing is saved. Storage is untrusted input:
   * everything is validated.
   */
  function adoptSaved(first: boolean): boolean {
    // Ledger first — it's independent of whether a plan was saved.
    try {
      const rawLedger = localStorage.getItem(LEDGER_KEY);
      const parsedLedger = rawLedger ? ledgerSchema.safeParse(JSON.parse(rawLedger)) : null;
      if (parsedLedger?.success) setLedger(parsedLedger.data);
      else if (!first && rawLedger === null) setLedger([]);
    } catch {
      // Corrupted ledger → keep what we have; never block the plan restore.
    }
    // Fall back to the pre-rename key so an existing plan isn't lost;
    // it's migrated to the current key on the next write.
    const legacy = first ? localStorage.getItem(LEGACY_STORAGE_KEY) : null;
    const raw = localStorage.getItem(STORAGE_KEY) ?? legacy;
    if (!raw) return false;
    if (legacy !== null) localStorage.removeItem(LEGACY_STORAGE_KEY);
    const parsed = JSON.parse(raw) as {
      scenarios?: unknown;
      selectedId?: unknown;
      lastBackupAt?: unknown;
      prefs?: unknown;
    };
    if (
      typeof parsed.lastBackupAt === 'string' &&
      Number.isFinite(Date.parse(parsed.lastBackupAt))
    ) {
      setLastBackupAt(parsed.lastBackupAt.slice(0, 40));
    }
    const prefs = (parsed.prefs ?? {}) as { theme?: unknown; fontScale?: unknown; lang?: unknown };
    if (prefs.theme === 'system' || prefs.theme === 'light' || prefs.theme === 'dark') {
      setThemePref(prefs.theme);
    }
    if (typeof prefs.fontScale === 'number' && prefs.fontScale >= 0.8 && prefs.fontScale <= 1.4) {
      setFontScale(Math.round(prefs.fontScale * 10) / 10);
    }
    // The installed app always opens at "/", so remember the language — but
    // an explicit ?lang in the address still wins.
    if (
      first &&
      (prefs.lang === 'en' || prefs.lang === 'zh') &&
      prefs.lang !== locale &&
      !new URLSearchParams(window.location.search).has('lang')
    ) {
      setLocale(prefs.lang);
    }
    // Preferences alone (no plan yet) still count as a first visit.
    if (!Array.isArray(parsed.scenarios)) return false;
    const restored: ComparableScenario[] = [];
    for (const sc of parsed.scenarios) {
      const c = sc as { id?: unknown; name?: unknown; assumptions?: unknown };
      const a = assumptionsSchema.safeParse(c.assumptions);
      if (a.success && typeof c.id === 'string' && typeof c.name === 'string') {
        restored.push({ id: c.id, name: c.name.slice(0, 80), assumptions: a.data });
      }
    }
    if (restored.length === 0) return false;
    setScenarios(restored);
    setSelectedId(
      typeof parsed.selectedId === 'string' && restored.some((r) => r.id === parsed.selectedId)
        ? parsed.selectedId
        : restored[0]!.id,
    );
    setSaveLocal(true);
    return true;
  }

  function enterDemo() {
    if (demo) return;
    const now = new Date();
    const sample = sampleData(
      { year: now.getFullYear(), month: now.getMonth() + 1 },
      t.demo.person,
    );
    // An Undo offered before this must not reach into the sample (or back).
    setToast(null);
    setDemo({ scenarios, selectedId, ledger, guiding });
    setScenarios([{ id: 'sample', name: t.demo.plan, assumptions: sample.assumptions }]);
    setSelectedId('sample');
    setLedger(sample.ledger);
    setGuiding(false);
    setTab('track');
    window.scrollTo({ top: 0 });
  }
  function exitDemo() {
    if (!demo) return;
    // An Undo from the sample must never run against the person's own data.
    setToast(null);
    // What storage holds now is the truth — another tab may have logged a
    // month while this one showed the sample. Fall back to the snapshot only
    // when nothing is saved (or saving is off).
    let restored = false;
    if (saveLocal && hydrated.current) {
      try {
        adopting.current = true;
        restored = adoptSaved(false);
      } catch {
        restored = false;
      }
      if (!restored) adopting.current = false;
    }
    if (!restored) {
      setScenarios(demo.scenarios);
      setSelectedId(demo.selectedId);
      setLedger(demo.ledger);
      // Putting back exactly what was there needs no write (and a first
      // visitor mustn't get a blank plan saved). Only when a write would follow.
      skipPersist.current = saveLocal && hydrated.current;
    }
    setGuiding(demo.guiding);
    setDemo(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has('demo')) {
      url.searchParams.delete('demo');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
    window.scrollTo({ top: 0 });
  }
  useEffect(() => {
    if (!wantDemo) return;
    const id = window.setTimeout(() => {
      setWantDemo(false);
      enterDemo();
    }, 0);
    return () => window.clearTimeout(id);
    // enterDemo reads the state just restored; it only calls setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantDemo]);

  // Restore a saved session once, after mount (deferred a tick so the SSR
  // and hydration renders agree; storage is untrusted → validate everything).
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        // Nothing saved → first visit. Open the guided setup rather than
        // dropping someone into fifty inputs.
        if (!adoptSaved(true)) {
          setGuiding(true);
          // Opened from a link that chose a language (?lang=zh): remember just
          // that, so the installed app — which opens at "/" — keeps it. No plan
          // is written until the person makes one.
          const lang = new URLSearchParams(window.location.search).get('lang');
          if ((lang === 'en' || lang === 'zh') && localStorage.getItem(STORAGE_KEY) === null) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ prefs: { lang } }));
          }
        }
      } catch {
        // Corrupted storage → start clean rather than crash.
      } finally {
        // Restore is done (found, missing, or broken) — writing is now safe.
        hydrated.current = true;
        // A link to ?demo opens the sample straight away.
        if (new URLSearchParams(window.location.search).has('demo')) setWantDemo(true);
        // App-icon shortcuts (manifest `shortcuts`): ?go=log | plan | data.
        const go = new URLSearchParams(window.location.search).get('go');
        if (go === 'plan') setTab('plan');
        if (go === 'data') openData();
        if (go === 'log') {
          window.setTimeout(
            () => document.getElementById('checkin')?.scrollIntoView({ block: 'start' }),
            50,
          );
        }
        if (go) {
          const url = new URL(window.location.href);
          url.searchParams.delete('go');
          window.history.replaceState(null, '', url.pathname + url.search);
        }
      }
    }, 0);
    return () => window.clearTimeout(id);
    // Runs once on mount by design; adoptSaved only calls state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Another tab or window of the app saved: adopt its version (last write
  // wins, and nobody silently overwrites the other).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY && e.key !== LEDGER_KEY) return;
      if (demo || !saveLocal || !hydrated.current) return;
      try {
        adopting.current = true;
        adoptSaved(false);
        notify(t.track.data.otherTab);
      } catch {
        adopting.current = false;
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveLocal, t, demo]);

  // While enabled, mirror every change to localStorage (device-only).
  useEffect(() => {
    if (demo) return;
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    if (!saveLocal || !hydrated.current) return;
    if (adopting.current) {
      adopting.current = false; // just read from storage — nothing to write
      return;
    }
    let failed = false;
    try {
      const prefs = { theme: themePref, fontScale, lang: locale };
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ scenarios, selectedId, lastBackupAt, prefs }),
      );
      if (ledger.length > 0) localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
      else localStorage.removeItem(LEDGER_KEY);
    } catch {
      // Storage full / blocked (private browsing). Keep running in memory,
      // but SAY so — silently losing someone's ledger is the worst outcome.
      failed = true;
    }
    const id = window.setTimeout(() => setStorageError(failed), 0);
    return () => window.clearTimeout(id);
  }, [demo, saveLocal, scenarios, selectedId, ledger, lastBackupAt, themePref, fontScale, locale]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0b0b0c' : '#f6f6f7');
  }, [theme]);
  useEffect(() => {
    // `zoom` scales the whole page like browser zoom — reliable given the
    // mix of rem and px text sizes in the UI.
    document.documentElement.style.zoom = String(fontScale);
  }, [fontScale]);
  const [comparing, setComparing] = useState(false);
  // Progressive disclosure: keep the default view simple; reveal the analysis
  // panels (goal-seek, FIRE, stress) + the asset-mix calculator on demand.
  const [advanced, setAdvanced] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const current = scenarios.find((s) => s.id === selectedId) ?? scenarios[0]!;
  const assumptions = current.assumptions;

  function patchCurrent(next: Assumptions) {
    setScenarios((arr) => arr.map((s) => (s.id === current.id ? { ...s, assumptions: next } : s)));
  }

  /**
   * Change some fields of the current plan, on top of whatever it is when the
   * update lands — so an Undo restores just that field, not a whole stale plan.
   */
  function patchField(patch: Partial<Assumptions>) {
    const id = current.id;
    setScenarios((arr) =>
      arr.map((s) => (s.id === id ? { ...s, assumptions: { ...s.assumptions, ...patch } } : s)),
    );
  }

  function renameCurrent(nextName: string) {
    setScenarios((arr) => arr.map((s) => (s.id === current.id ? { ...s, name: nextName } : s)));
  }

  function addScenario() {
    const fresh: ComparableScenario = {
      id: newId(),
      name: t.scenarioBar.defaultName(scenarios.length + 1),
      assumptions: defaultAssumptions(),
    };
    setScenarios((arr) => [...arr, fresh]);
    setSelectedId(fresh.id);
  }

  function duplicateCurrent() {
    const copy: ComparableScenario = {
      id: newId(),
      name: t.scenarioBar.copySuffix(current.name).slice(0, 80),
      // Structured clone to avoid sharing the assumptions object across rows.
      assumptions: JSON.parse(JSON.stringify(assumptions)) as Assumptions,
    };
    setScenarios((arr) => [...arr, copy]);
    setSelectedId(copy.id);
  }

  function removeCurrent() {
    if (scenarios.length === 1) return;
    const before = { scenarios, selectedId };
    // Dropping below 2 makes compare meaningless — return to the editor.
    if (scenarios.length <= 2) setComparing(false);
    const next = scenarios.filter((s) => s.id !== current.id);
    setScenarios(next);
    // Re-select something that still exists.
    setSelectedId(next[0]!.id);
    notify(t.toast.planRemoved(current.name), () => {
      setScenarios(before.scenarios);
      setSelectedId(before.selectedId);
    });
  }

  /** Replace everything (backup restore, cloud download) — undoable. */
  function replaceAll(
    r: { scenarios: ComparableScenario[]; selectedId: string; ledger: MonthEntry[] },
    text: string,
  ) {
    const before = { scenarios, selectedId, ledger };
    setScenarios(r.scenarios);
    setSelectedId(r.selectedId);
    setLedger(r.ledger);
    setComparing(false);
    notify(text, () => {
      setScenarios(before.scenarios);
      setSelectedId(before.selectedId);
      setLedger(before.ledger);
    });
  }

  function exportCurrent() {
    downloadScenarioJson(current.name, assumptions);
    notify(t.scenarioBar.downloaded);
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so re-selecting the same file fires onChange
    if (!file) return;
    setImportError(null);
    try {
      const raw: unknown = JSON.parse(await file.text());
      // Accept either the exported `{ name, assumptions }` envelope or a
      // bare assumptions object. Validate against the same schema the
      // engine relies on, so a malformed or hand-edited file can't crash
      // the projection.
      const container = (raw ?? {}) as { name?: unknown; assumptions?: unknown };
      const candidate = container.assumptions ?? raw;
      const parsed = assumptionsSchema.safeParse(candidate);
      if (!parsed.success) {
        setImportError(t.scenarioBar.invalidScenario);
        return;
      }
      const name =
        typeof container.name === 'string' && container.name.trim()
          ? container.name.slice(0, 80)
          : t.scenarioBar.importedName;
      const fresh: ComparableScenario = { id: newId(), name, assumptions: parsed.data };
      setScenarios((arr) => [...arr, fresh]);
      setSelectedId(fresh.id);
      setComparing(false);
      notify(t.scenarioBar.imported);
    } catch {
      setImportError(t.scenarioBar.unreadableFile);
    }
  }

  const result = useMemo(() => {
    try {
      return simulate(assumptions);
    } catch (err) {
      console.warn('[public-simulator] simulate failed', err);
      return null;
    }
  }, [assumptions]);

  // Monte-Carlo bands — only computed when the probabilistic view is active.
  const mc = useMemo(() => {
    if (chartEngine !== 'probabilistic') return null;
    try {
      return runMonteCarlo(assumptions, { volatilityPct });
    } catch (err) {
      console.warn('[public-simulator] monte-carlo failed', err);
      return null;
    }
  }, [chartEngine, assumptions, volatilityPct]);

  const fire = useMemo(() => fireHeadline(assumptions), [assumptions]);

  // Nudge toward a backup file once there's something worth losing: two or
  // more months logged, no backup in BACKUP_STALE_DAYS, and no cloud account
  // (signed-in people have the encrypted copy).
  const backupDays = daysSince(lastBackupAt);
  const showNudge =
    !demo &&
    !nudgeDismissed &&
    !accountEmail &&
    ledger.length >= 2 &&
    (backupDays === null || backupDays >= BACKUP_STALE_DAYS);

  const lastNominal = result?.rows[result.rows.length - 1]?.netWorth ?? 0;
  const lastReal = result?.rows[result.rows.length - 1]?.netWorthRealTodayDollars ?? 0;

  // Savings is derived (after-tax income − spending); surface the implied
  // rate for the first year so the number the old "savings rate" input used
  // to hold is still visible — just as an output now.
  const firstRow = result?.rows[0];
  const impliedSavingsRate =
    firstRow && firstRow.afterTaxIncome > 0
      ? (firstRow.saved / firstRow.afterTaxIncome) * 100
      : null;

  // Markers identical to the authed simulator: a dot per windfall and
  // per active major-expense year on the base line.
  const markers = useMemo<Marker[]>(() => {
    if (!result) return [];
    const byYear = new Map(result.rows.map((r) => [r.year, r]));
    const out: Marker[] = [];
    for (const w of assumptions.windfalls) {
      const row = byYear.get(w.year);
      if (!row) continue;
      out.push({
        year: w.year,
        value: displayMode === 'real' ? row.netWorthRealTodayDollars : row.netWorth,
        label: w.label,
        tone: 'windfall',
      });
    }
    for (const e of assumptions.majorExpenses) {
      const yrs =
        'year' in e ? [e.year] : Array.from({ length: e.years }, (_, i) => e.startYear + i);
      for (const y of yrs) {
        const row = byYear.get(y);
        if (!row) continue;
        out.push({
          year: y,
          value: displayMode === 'real' ? row.netWorthRealTodayDollars : row.netWorth,
          label: e.label,
          tone: 'expense',
        });
      }
    }
    return out;
  }, [result, assumptions.windfalls, assumptions.majorExpenses, displayMode]);

  const highlightYears = useMemo(() => {
    const set = new Set<number>();
    for (const p of assumptions.people) {
      for (const s of p.careerStages) {
        set.add(p.birthYear + s.startAge);
      }
    }
    for (const w of assumptions.windfalls) set.add(w.year);
    for (const e of assumptions.majorExpenses) {
      if ('year' in e) set.add(e.year);
      else for (let i = 0; i < e.years; i += 1) set.add(e.startYear + i);
    }
    return set;
  }, [assumptions.people, assumptions.windfalls, assumptions.majorExpenses]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="display flex min-w-0 items-center gap-2.5 text-xl sm:text-2xl">
            <span
              aria-hidden
              className="bg-foreground text-background flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-base font-bold"
            >
              W
            </span>
            <span className="truncate">{t.app.title}</span>
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            {!install.standalone && (install.prompt || install.ios) ? (
              <button type="button" onClick={openData} className="btn btn-sm">
                {t.install.headerBtn}
              </button>
            ) : null}
            {CLOUD ? (
              <button
                type="button"
                onClick={openData}
                title={accountEmail ?? undefined}
                className="btn btn-sm max-w-40 gap-1.5"
              >
                {accountEmail ? (
                  <>
                    <span className="bg-positive inline-block h-1.5 w-1.5 shrink-0 rounded-full" />
                    <span className="truncate">{accountEmail}</span>
                  </>
                ) : (
                  t.cloud.signIn
                )}
              </button>
            ) : null}
            <SettingsMenu
              theme={themePref}
              onTheme={setThemePref}
              fontScale={fontScale}
              onFontScale={setFontScale}
            />
          </div>
        </div>
        {/* Phones get the app, not the brochure — the promise is restated in Data. */}
        <p className="text-muted hidden text-[13px] sm:block">
          {CLOUD ? t.app.taglineCloud : t.app.tagline}
        </p>
      </header>

      {/* Sections: a segmented control on desktop, a bottom tab bar on phones. */}
      <nav aria-label={t.nav.aria} className="tabbar print-hide">
        {(
          [
            ['track', 'coins'],
            ['plan', 'chart'],
            ['data', 'shield'],
          ] as const
        ).map(([id, icon]) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => {
              if (id === 'data') return openData();
              setTab(id);
              window.scrollTo({ top: 0 });
            }}
            className="tabbar-item"
          >
            <Icon name={icon} size={14} />
            {t.nav[id]}
          </button>
        ))}
      </nav>

      {guiding ? (
        <GuidedSetup
          onComplete={(a) => {
            patchCurrent(a);
            setGuiding(false);
            setTab('plan');
          }}
          onCancel={() => setGuiding(false)}
          onDemo={enterDemo}
        />
      ) : null}

      {/* A newer version is installed behind this page: on every section. */}
      <UpdateBanner />

      {demo ? (
        <section className="card card-tight fade-in flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px]">{t.demo.banner}</p>
          <button type="button" className="btn btn-primary shrink-0" onClick={exitDemo}>
            {t.demo.exit}
          </button>
        </section>
      ) : null}

      {tab === 'track' && showNudge ? (
        <div className="card card-tight fade-in flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="flex min-w-0 flex-1 items-start gap-2.5 text-[13px]">
            <Icon name="shield" size={16} className="text-accent mt-0.5" />
            <span>
              {backupDays === null ? t.nudge.never(ledger.length) : t.nudge.stale(backupDays)}
            </span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setLastBackupAt(downloadBackup(scenarios, selectedId, ledger));
                notify(t.toast.backedUp);
              }}
            >
              <Icon name="download" size={14} />
              {t.nudge.backUp}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setNudgeDismissed(true)}
            >
              {t.nudge.dismiss}
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'track' ? (
        <div className="fade-in">
          <LedgerPanel
            // Sample ↔ own data: start every form fresh, never carry state across.
            key={demo ? 'sample' : 'own'}
            showWidgets={!guiding}
            entries={ledger}
            onChange={setLedger}
            assumptions={assumptions}
            planRows={result?.rows ?? []}
            fire={fire}
            onOpenPlan={() => {
              setTab('plan');
              window.scrollTo({ top: 0 });
            }}
            onCalibrate={(patch) => {
              const before = assumptions;
              patchCurrent({ ...assumptions, ...patch });
              notify(t.toast.calibrated, () => patchCurrent(before));
            }}
            notify={notify}
            onBudgets={(monthlyBudgets) => patchField({ monthlyBudgets })}
            onAnnual={(annualExpenses) => patchField({ annualExpenses })}
            onGoals={(savingsGoals) => patchField({ savingsGoals })}
          />
        </div>
      ) : null}

      {tab === 'data' && demo ? (
        <section className="card fade-in">
          <p className="text-[13px]">{t.demo.dataNote}</p>
          <button type="button" className="btn btn-primary mt-3" onClick={exitDemo}>
            {t.demo.exit}
          </button>
        </section>
      ) : null}

      {dataMounted ? (
        <div
          className={
            tab === 'data' && !demo
              ? 'fade-in grid grid-cols-1 items-start gap-4 lg:grid-cols-2'
              : 'hidden'
          }
        >
          <div className="flex flex-col gap-4">
            {/* Long-term use needs a copy the browser can't lose. */}
            <DataCard
              scenarios={scenarios}
              selectedId={selectedId}
              ledger={ledger}
              saveLocal={saveLocal}
              storageError={storageError}
              lastBackupAt={lastBackupAt}
              onToggleSave={(on) => {
                setSaveLocal(on);
                if (!on) {
                  setStorageError(false);
                  try {
                    localStorage.removeItem(STORAGE_KEY);
                    localStorage.removeItem(LEDGER_KEY);
                  } catch {
                    // ignore
                  }
                }
              }}
              onBackedUp={setLastBackupAt}
              onRestore={(r) => replaceAll(r, t.toast.restored)}
            />
            <InstallCard state={install} />
            <ClaudeCard />
          </div>
          {/* Signing in is what people come here for — first on a phone. */}
          <div className="order-first lg:order-last">
            {CLOUD ? (
              <CloudSync
                scenarios={scenarios}
                selectedId={selectedId}
                ledger={ledger}
                arrival={arrival}
                onAuth={setAccountEmail}
                onRestore={(r) => replaceAll(r, t.toast.downloaded)}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'plan' ? (
        <div className="fade-in flex flex-col gap-5">
          {/* Just made a plan, nothing logged: the next step is the habit. */}
          {ledger.length === 0 ? (
            <section className="card card-tight flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[14px] font-medium">{t.nextStep.title}</p>
                <p className="text-muted mt-0.5 text-xs">{t.nextStep.body}</p>
              </div>
              <button
                type="button"
                className="btn btn-primary shrink-0"
                onClick={() => {
                  setTab('track');
                  window.scrollTo({ top: 0 });
                }}
              >
                {t.nextStep.cta} ›
              </button>
            </section>
          ) : null}
          {/* Scenario bar — pick / name / manage the current scenario. */}
          <section className="card card-tight flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <select
                aria-label={t.scenarioBar.scenarioAria}
                className="field min-w-0 flex-1"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addScenario}
                className="border-border hover:bg-foreground/5 shrink-0 rounded border px-3 py-2 text-[13px]"
              >
                {t.scenarioBar.newScenario}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setGuiding((v) => !v);
                  setComparing(false);
                }}
                title={t.guided.startHint}
                className={`btn ${guiding ? 'text-accent' : ''}`}
              >
                {t.guided.start}
              </button>
              {scenarios.length >= 2 ? (
                <button
                  type="button"
                  onClick={() => setComparing((v) => !v)}
                  className={`btn ${comparing ? 'text-accent' : ''}`}
                >
                  {comparing ? t.scenarioBar.backToEditor : t.scenarioBar.compare}
                </button>
              ) : null}
              <button
                type="button"
                aria-expanded={managing}
                onClick={() => setManaging((v) => !v)}
                className="btn btn-ghost ml-auto"
              >
                {t.scenarioBar.manage} {managing ? '−' : '+'}
              </button>
            </div>

            {managing ? (
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  aria-label={t.scenarioBar.nameAria}
                  value={current.name}
                  maxLength={80}
                  onChange={(e) => renameCurrent(e.target.value)}
                  className="field"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={duplicateCurrent} className="btn">
                    {t.scenarioBar.duplicate}
                  </button>
                  <button type="button" onClick={exportCurrent} className="btn">
                    {t.scenarioBar.exportJson}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn"
                  >
                    {t.scenarioBar.importJson}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={onImportFile}
                    className="hidden"
                  />
                  {scenarios.length > 1 ? (
                    <button
                      type="button"
                      onClick={removeCurrent}
                      className="text-muted hover:text-negative ml-auto text-[13px]"
                    >
                      {t.scenarioBar.remove}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {importError ? <p className="text-negative text-xs">{importError}</p> : null}
          </section>

          {comparing ? (
            <CompareView scenarios={scenarios} onExit={() => setComparing(false)} />
          ) : (
            <>
              {/* Side-by-side: assumptions (left) + live projection (right, sticky
              on desktop so edits update the chart in real time). On mobile it
              stacks — projection on top, assumptions below. */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Assumptions — edit here, watch the projection move. */}
                <div className="order-2 lg:order-1">
                  {/* The summary card carries its own heading — an "Assumptions"
                  eyebrow on top of "Your plan" was two labels for one thing. */}
                  <div className="flex flex-col gap-4">
                    <PlanSummary assumptions={assumptions} onChange={patchCurrent}>
                      <AssumptionsForm value={assumptions} onChange={patchCurrent} />
                    </PlanSummary>
                    <PaycheckCalculator
                      onApplyRate={(rate) => {
                        const before = assumptions;
                        patchCurrent({ ...assumptions, effectiveTaxRatePct: rate });
                        notify(t.paycheck.applied(`${rate}%`), () => patchCurrent(before));
                      }}
                    />
                  </div>
                </div>

                {/* Projection — pinned on desktop. */}
                <div
                  className={`order-1 flex flex-col gap-6 lg:order-2 lg:self-start ${
                    // Sticky only in the simple view. With advanced tools open the
                    // column is taller than the viewport — pinning it would make
                    // its lower panels unreachable while the form scrolls.
                    advanced ? '' : 'lg:sticky lg:top-6'
                  }`}
                >
                  {/* The answer first. The product is named after this sentence,
                  so it outranks the balance — a number nobody can feel. */}
                  <InsightsPanel assumptions={assumptions} onChange={patchCurrent} />

                  {/* The balance behind it: supporting evidence, not the point.
                  REAL leads. Over a long horizon the nominal figure is
                  inflated several times over and reads as a fantasy — the
                  today's-dollar number is the only one a human can judge. */}
                  <section className="card">
                    <SectionLabel icon="coins">
                      {t.projection.finalBalance(assumptions.horizonEndYear)}
                    </SectionLabel>
                    <p className="figure mt-2 text-[30px]">{fmt.currency0(lastReal)}</p>
                    <p className="text-muted nums mt-1 text-[13px]">
                      {t.projection.nominalNote(fmt.currency0(lastNominal))}
                    </p>
                    {impliedSavingsRate !== null ? (
                      <p className="text-muted nums mt-1 text-xs">
                        {t.projection.impliedSavings(fmt.pct0(impliedSavingsRate))}
                      </p>
                    ) : null}
                  </section>

                  {/* View switcher: chart / pixel world / year table. Tabs, not
                  three stacked panels with their own show/hide buttons. */}
                  <div className="bg-surface-2 flex w-fit overflow-hidden rounded-[10px] text-xs">
                    {(['chart', 'table', 'world'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={view === v}
                        onClick={() => setView(v)}
                        className={`min-h-9 px-3.5 font-medium transition-colors ${
                          view === v
                            ? 'bg-foreground text-background'
                            : 'text-muted hover:text-foreground'
                        }`}
                      >
                        {t.views[v]}
                      </button>
                    ))}
                  </div>

                  {/* Pixel journey — the projection as a tiny living world. */}
                  {view === 'world' ? (
                    <section className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <SectionLabel icon="house">{t.pixel.heading}</SectionLabel>
                        <div className="flex items-center gap-2">
                          {
                            <div className="bg-surface-2 flex overflow-hidden rounded-[10px] text-xs">
                              {(['meadow', 'seaside', 'snow'] as const).map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => setPixelScene(s)}
                                  className={`px-2 py-0.5 ${
                                    pixelScene === s
                                      ? 'bg-foreground/10 text-foreground'
                                      : 'text-muted'
                                  }`}
                                >
                                  {t.pixel.scenes[s]}
                                </button>
                              ))}
                            </div>
                          }
                        </div>
                      </div>
                      {result ? (
                        <>
                          <PixelJourney
                            rows={result.rows}
                            assumptions={assumptions}
                            theme={theme}
                            scene={pixelScene}
                          />
                          <p className="text-muted text-[11px]">{t.pixel.caption}</p>
                        </>
                      ) : null}
                    </section>
                  ) : null}

                  {/* Chart — deterministic band or probabilistic (Monte-Carlo) fan. */}
                  {view === 'chart' ? (
                    <section className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <SectionLabel icon="chart">
                          {chartEngine === 'probabilistic'
                            ? t.projection.mcHeading
                            : displayMode === 'both'
                              ? t.projection.bothHeading
                              : t.projection.bandHeading}
                        </SectionLabel>
                        <div className="bg-surface-2 flex overflow-hidden rounded-[10px] text-xs">
                          {(['deterministic', 'probabilistic'] as const).map((e) => (
                            <button
                              key={e}
                              type="button"
                              aria-pressed={chartEngine === e}
                              onClick={() => setChartEngine(e)}
                              className={`px-2.5 py-1 ${
                                chartEngine === e
                                  ? 'bg-foreground/10 text-foreground'
                                  : 'text-muted'
                              }`}
                            >
                              {e === 'deterministic' ? t.projection.detMode : t.projection.probMode}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Secondary controls: nominal/real (deterministic) or volatility (probabilistic). */}
                      <div className="flex items-center justify-between gap-2">
                        {chartEngine === 'deterministic' ? (
                          <div className="bg-surface-2 flex overflow-hidden rounded-[10px] text-xs">
                            {(['nominal', 'real', 'both'] as const).map((m) => (
                              <button
                                key={m}
                                type="button"
                                aria-pressed={displayMode === m}
                                onClick={() => setDisplayMode(m)}
                                className={`px-2.5 py-1 ${
                                  displayMode === m
                                    ? 'bg-foreground/10 text-foreground'
                                    : 'text-muted'
                                }`}
                              >
                                {t.projection[m]}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <label className="text-muted flex items-center gap-1.5 text-xs">
                            {t.projection.volatility}
                            <input
                              type="number"
                              value={volatilityPct}
                              min={0}
                              max={60}
                              step={1}
                              onChange={(e) =>
                                setVolatilityPct(
                                  Math.max(0, Math.min(60, Number(e.target.value) || 0)),
                                )
                              }
                              className="border-border focus:border-foreground nums w-14 rounded border bg-transparent px-2 py-1 text-right outline-none"
                            />
                            %
                          </label>
                        )}
                        {chartEngine === 'probabilistic' && mc?.successProbability != null ? (
                          <span className="text-positive nums text-xs">
                            {t.projection.successProb(fmt.pct0(mc.successProbability * 100))}
                          </span>
                        ) : null}
                      </div>

                      {chartEngine === 'probabilistic' ? (
                        mc ? (
                          <MonteCarloChart mc={mc} />
                        ) : (
                          <p className="text-negative text-[13px]">{t.projection.computeError}</p>
                        )
                      ) : result ? (
                        <SimulatorChart result={result} mode={displayMode} markers={markers} />
                      ) : (
                        <p className="text-negative text-[13px]">{t.projection.computeError}</p>
                      )}

                      <p className="text-muted text-[11px]">
                        {chartEngine === 'probabilistic'
                          ? mc?.successProbability == null
                            ? `${t.projection.mcCaption} ${t.projection.mcNeedTarget}`
                            : t.projection.mcCaption
                          : displayMode === 'both'
                            ? t.projection.gapCaption
                            : t.projection.bandCaption}
                      </p>
                    </section>
                  ) : null}

                  {/* Year-by-year table — scrolls sideways inside the column. */}
                  {view === 'table' && result ? (
                    <YearTable
                      rows={result.rows}
                      people={assumptions.people}
                      highlightYears={highlightYears}
                    />
                  ) : null}

                  {/* Advanced tools — collapsed by default (progressive disclosure). */}
                  <button
                    type="button"
                    onClick={() => setAdvanced((v) => !v)}
                    className="btn w-full justify-between"
                  >
                    <span>{advanced ? t.advanced.hide : t.advanced.show}</span>
                    <span className="text-muted text-[11px]">
                      {advanced ? '−' : `+ ${t.advanced.hint}`}
                    </span>
                  </button>

                  {advanced ? (
                    <>
                      {/* Goal-seek. */}
                      <GoalSeekPanel assumptions={assumptions} onChange={patchCurrent} />

                      {/* FIRE — the year work becomes optional. */}
                      {result ? (
                        <FirePanel
                          assumptions={assumptions}
                          rows={result.rows}
                          onChange={patchCurrent}
                        />
                      ) : null}

                      {/* Stress test — job loss + market crash what-ifs. */}
                      {result ? (
                        <StressPanel
                          assumptions={assumptions}
                          rows={result.rows}
                          onChange={patchCurrent}
                        />
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}

      <p className="text-muted text-[11px] italic">{t.footer.disclaimer}</p>
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}

// The OS light/dark setting, read without a hydration mismatch: the server
// snapshot is dark (the default theme); the client subscribes to changes.
function subscribeColorScheme(onChange: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
function prefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
