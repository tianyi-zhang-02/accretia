'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import MonteCarloChart from '@/components/charts/montecarlo-chart';
import SimulatorChart, { type DisplayMode, type Marker } from '@/components/charts/simulator-chart';
import LangSwitch from '@/components/i18n/lang-switch';
import AssumptionsForm from '@/components/simulator/assumptions-form';
import CompareView, { type ComparableScenario } from '@/components/simulator/compare-view';
import { defaultAssumptions, newId } from '@/components/simulator/default-assumptions';
import PixelJourney, { type PixelScene } from '@/components/pixel/pixel-journey';
import FirePanel from '@/components/simulator/fire-panel';
import GoalSeekPanel from '@/components/simulator/goal-seek-panel';
import StressPanel from '@/components/simulator/stress-panel';
import YearTable from '@/components/simulator/year-table';
import { LocaleProvider, useI18n } from '@/lib/i18n/locale';
import { simulate } from '@/lib/simulator/engine';
import { runMonteCarlo } from '@/lib/simulator/montecarlo';
import { assumptionsSchema, type Assumptions } from '@/lib/validation/scenarios';

/**
 * Wealth-projection simulator — the entire app.
 *
 * Purely client-side. There is no backend, no database, no auth, and
 * nothing is stored or cached anywhere:
 *
 *   - Scenarios live in this component's React state only. Refreshing the
 *     tab resets to a single blank scenario. Nothing is written to a
 *     server, and nothing is written to browser storage (no localStorage,
 *     no cookies).
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

/** Public entry — provides the locale context to the whole app. */
export default function SimulatorClient() {
  return (
    <LocaleProvider>
      <SimulatorInner />
    </LocaleProvider>
  );
}

function SimulatorInner() {
  const { t, fmt } = useI18n();

  // In-memory scenarios. Nothing is written to a server or to browser
  // storage — refresh means a clean slate. Persistence is by file only
  // (Export / Import JSON).
  const [scenarios, setScenarios] = useState<ComparableScenario[]>(() => [
    { id: newId(), name: t.scenarioBar.defaultName(1), assumptions: defaultAssumptions() },
  ]);
  const [selectedId, setSelectedId] = useState<string>(() => scenarios[0]!.id);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('nominal');
  // Deterministic band vs probabilistic Monte-Carlo fan (a chart-level switch).
  const [chartEngine, setChartEngine] = useState<'deterministic' | 'probabilistic'>('deterministic');
  const [volatilityPct, setVolatilityPct] = useState(15);

  // Display preferences — in-memory (reset on refresh, per the no-storage rule).
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showPixel, setShowPixel] = useState(true);
  const [pixelScene, setPixelScene] = useState<PixelScene>('meadow');
  const [fontScale, setFontScale] = useState(1);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    // `zoom` scales the whole page like browser zoom — reliable given the
    // mix of rem and px text sizes in the UI.
    document.documentElement.style.zoom = String(fontScale);
  }, [fontScale]);
  const [showTable, setShowTable] = useState(false);
  const [comparing, setComparing] = useState(false);
  // Progressive disclosure: keep the default view simple; reveal the analysis
  // panels (goal-seek, FIRE, stress) + the asset-mix calculator on demand.
  const [advanced, setAdvanced] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function flash(msg: string) {
    setNote(msg);
    window.setTimeout(() => setNote(null), 2200);
  }

  const current = scenarios.find((s) => s.id === selectedId) ?? scenarios[0]!;
  const assumptions = current.assumptions;

  function patchCurrent(next: Assumptions) {
    setScenarios((arr) => arr.map((s) => (s.id === current.id ? { ...s, assumptions: next } : s)));
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
    // Dropping below 2 makes compare meaningless — return to the editor.
    if (scenarios.length <= 2) setComparing(false);
    setScenarios((arr) => {
      const next = arr.filter((s) => s.id !== current.id);
      // Re-select something that still exists.
      setSelectedId(next[0]!.id);
      return next;
    });
  }

  function exportCurrent() {
    downloadScenarioJson(current.name, assumptions);
    flash(t.scenarioBar.downloaded);
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
      flash(t.scenarioBar.imported);
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

  const lastNominal = result?.rows[result.rows.length - 1]?.netWorth ?? 0;
  const lastReal = result?.rows[result.rows.length - 1]?.netWorthRealTodayDollars ?? 0;
  const firstNominal = result?.rows[0]?.netWorth ?? 0;
  const totalGrowth = firstNominal > 0 ? (lastNominal / firstNominal - 1) * 100 : 0;

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
        <div className="flex items-start justify-between gap-3">
          <h1 className="serif-display text-2xl">{t.app.title}</h1>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Font size */}
            <div className="border-border flex rounded border text-[11px]">
              <button
                type="button"
                aria-label={t.controls.smaller}
                onClick={() => setFontScale((s) => Math.max(0.8, Math.round((s - 0.1) * 10) / 10))}
                className="text-muted hover:text-foreground px-2 py-0.5"
              >
                A−
              </button>
              <button
                type="button"
                aria-label={t.controls.larger}
                onClick={() => setFontScale((s) => Math.min(1.4, Math.round((s + 0.1) * 10) / 10))}
                className="text-muted hover:text-foreground px-2 py-0.5 text-sm"
              >
                A+
              </button>
            </div>
            {/* Theme */}
            <button
              type="button"
              aria-label={theme === 'dark' ? t.controls.lightTheme : t.controls.darkTheme}
              onClick={() => setTheme((v) => (v === 'dark' ? 'light' : 'dark'))}
              className="border-border text-muted hover:text-foreground rounded border px-2 py-0.5 text-[11px]"
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <LangSwitch />
          </div>
        </div>
        <p className="text-muted text-xs">{t.app.tagline}</p>
      </header>

      {/* Scenario bar — pick / name / manage the current scenario. */}
      <section className="border-border flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <select
            aria-label={t.scenarioBar.scenarioAria}
            className="border-border bg-background min-w-0 flex-1 rounded border px-3 py-2 text-sm"
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
            className="border-border hover:bg-foreground/5 shrink-0 rounded border px-3 py-2 text-xs"
          >
            {t.scenarioBar.newScenario}
          </button>
        </div>

        <input
          type="text"
          aria-label={t.scenarioBar.nameAria}
          value={current.name}
          maxLength={80}
          onChange={(e) => renameCurrent(e.target.value)}
          className="border-border focus:border-foreground rounded border bg-transparent px-3 py-2 text-sm outline-none"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={duplicateCurrent}
            className="border-border hover:bg-foreground/5 rounded border px-3 py-1.5 text-xs"
          >
            {t.scenarioBar.duplicate}
          </button>
          <button
            type="button"
            onClick={exportCurrent}
            className="border-border hover:bg-foreground/5 rounded border px-3 py-1.5 text-xs"
          >
            {t.scenarioBar.exportJson}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="border-border hover:bg-foreground/5 rounded border px-3 py-1.5 text-xs"
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
          {scenarios.length >= 2 ? (
            <button
              type="button"
              onClick={() => setComparing((v) => !v)}
              className={`rounded border px-3 py-1.5 text-xs ${
                comparing ? 'border-accent text-accent' : 'border-border hover:bg-foreground/5'
              }`}
            >
              {comparing ? t.scenarioBar.backToEditor : t.scenarioBar.compare}
            </button>
          ) : null}
          {scenarios.length > 1 ? (
            <button
              type="button"
              onClick={removeCurrent}
              className="text-muted hover:text-negative ml-auto text-xs"
            >
              {t.scenarioBar.remove}
            </button>
          ) : null}
        </div>
        {note ? <p className="text-positive text-[11px]">{note}</p> : null}
        {importError ? <p className="text-negative text-[11px]">{importError}</p> : null}
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
              <p className="text-muted mb-2 text-[10px] tracking-[0.18em] uppercase">
                {t.projection.assumptionsLabel}
              </p>
              <AssumptionsForm value={assumptions} onChange={patchCurrent} />
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
              {/* Headline result. */}
              <section className="border-border rounded-lg border p-4">
                <p className="text-muted text-[10px] tracking-[0.18em] uppercase">
                  {t.projection.finalBalance(assumptions.horizonEndYear)}
                </p>
                <p className="serif-display nums mt-1 text-3xl">{fmt.currency0(lastNominal)}</p>
                <p className="text-muted nums mt-1 text-xs">
                  {t.projection.inTodaysDollars(fmt.currency0(lastReal), fmt.signedPct1(totalGrowth))}
                </p>
                {impliedSavingsRate !== null ? (
                  <p className="text-muted nums mt-1 text-[11px]">
                    {t.projection.impliedSavings(fmt.pct0(impliedSavingsRate))}
                  </p>
                ) : null}
              </section>

              {/* Pixel journey — the projection as a tiny living world. */}
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-muted text-[10px] tracking-[0.18em] uppercase">
                    {t.pixel.heading}
                  </p>
                  <div className="flex items-center gap-2">
                    {showPixel ? (
                      <div className="border-border flex rounded border text-[10px]">
                        {(['meadow', 'seaside', 'snow'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setPixelScene(s)}
                            className={`px-2 py-0.5 ${
                              pixelScene === s ? 'bg-foreground/10 text-foreground' : 'text-muted'
                            }`}
                          >
                            {t.pixel.scenes[s]}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setShowPixel((v) => !v)}
                      className="text-muted hover:text-foreground text-xs"
                    >
                      {showPixel ? t.pixel.hide : t.pixel.show}
                    </button>
                  </div>
                </div>
                {showPixel && result ? (
                  <>
                    <PixelJourney
                      rows={result.rows}
                      assumptions={assumptions}
                      theme={theme}
                      scene={pixelScene}
                    />
                    <p className="text-muted text-[10px]">{t.pixel.caption}</p>
                  </>
                ) : null}
              </section>

              {/* Chart — deterministic band or probabilistic (Monte-Carlo) fan. */}
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-muted text-[10px] tracking-[0.18em] uppercase">
                    {chartEngine === 'probabilistic'
                      ? t.projection.mcHeading
                      : displayMode === 'both'
                        ? t.projection.bothHeading
                        : t.projection.bandHeading}
                  </p>
                  <div className="border-border flex rounded border text-[11px]">
                    {(['deterministic', 'probabilistic'] as const).map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setChartEngine(e)}
                        className={`px-2.5 py-1 ${
                          chartEngine === e ? 'bg-foreground/10 text-foreground' : 'text-muted'
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
                    <div className="border-border flex rounded border text-[11px]">
                      {(['nominal', 'real', 'both'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setDisplayMode(m)}
                          className={`px-2.5 py-1 ${
                            displayMode === m ? 'bg-foreground/10 text-foreground' : 'text-muted'
                          }`}
                        >
                          {t.projection[m]}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <label className="text-muted flex items-center gap-1.5 text-[11px]">
                      {t.projection.volatility}
                      <input
                        type="number"
                        value={volatilityPct}
                        min={0}
                        max={60}
                        step={1}
                        onChange={(e) =>
                          setVolatilityPct(Math.max(0, Math.min(60, Number(e.target.value) || 0)))
                        }
                        className="border-border focus:border-foreground nums w-14 rounded border bg-transparent px-2 py-1 text-right outline-none"
                      />
                      %
                    </label>
                  )}
                  {chartEngine === 'probabilistic' && mc?.successProbability != null ? (
                    <span className="text-positive nums text-[11px]">
                      {t.projection.successProb(fmt.pct0(mc.successProbability * 100))}
                    </span>
                  ) : null}
                </div>

                {chartEngine === 'probabilistic' ? (
                  mc ? (
                    <MonteCarloChart mc={mc} />
                  ) : (
                    <p className="text-negative text-xs">{t.projection.computeError}</p>
                  )
                ) : result ? (
                  <SimulatorChart result={result} mode={displayMode} markers={markers} />
                ) : (
                  <p className="text-negative text-xs">{t.projection.computeError}</p>
                )}

                <p className="text-muted text-[10px]">
                  {chartEngine === 'probabilistic'
                    ? mc?.successProbability == null
                      ? `${t.projection.mcCaption} ${t.projection.mcNeedTarget}`
                      : t.projection.mcCaption
                    : displayMode === 'both'
                      ? t.projection.gapCaption
                      : t.projection.bandCaption}
                </p>
              </section>

              {/* Advanced tools — collapsed by default (progressive disclosure). */}
              <button
                type="button"
                onClick={() => setAdvanced((v) => !v)}
                className="border-border hover:bg-foreground/5 flex items-center justify-between rounded border px-3 py-2 text-left text-xs"
              >
                <span>{advanced ? t.advanced.hide : t.advanced.show}</span>
                <span className="text-muted text-[10px]">
                  {advanced ? '−' : `+ ${t.advanced.hint}`}
                </span>
              </button>

              {advanced ? (
                <>
                  {/* Goal-seek. */}
                  <GoalSeekPanel assumptions={assumptions} onChange={patchCurrent} />

                  {/* FIRE — the year work becomes optional. */}
                  {result ? (
                    <FirePanel assumptions={assumptions} rows={result.rows} onChange={patchCurrent} />
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

          {/* Year-by-year table — full width below the split (it's wide). */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-muted text-[10px] tracking-[0.18em] uppercase">
                {t.table.heading}
              </p>
              <button
                type="button"
                onClick={() => setShowTable((v) => !v)}
                className="text-muted hover:text-foreground text-xs"
              >
                {showTable ? t.table.hide : t.table.show}
              </button>
            </div>
            {showTable && result ? (
              <YearTable
                rows={result.rows}
                people={assumptions.people}
                highlightYears={highlightYears}
              />
            ) : null}
          </section>
        </>
      )}

      <p className="text-muted text-[10px] italic">{t.footer.disclaimer}</p>
    </div>
  );
}
