'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import SimulatorChart, { type Marker } from '@/components/charts/simulator-chart';
import { simulate } from '@/lib/simulator/engine';
import type { Scenario } from '@/lib/types/scenario';
import type { Assumptions } from '@/lib/validation/scenarios';

import AssumptionsForm from '@/components/simulator/assumptions-form';
import CompareView from '@/components/simulator/compare-view';
import { defaultAssumptions } from '@/components/simulator/default-assumptions';
import GoalSeekPanel from '@/components/simulator/goal-seek-panel';
import YearTable from '@/components/simulator/year-table';

function fmtCurrency0(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;
}

export default function SimulatorClient({
  initialScenarios,
}: {
  initialScenarios: Scenario[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Deep-link entry points from the projection-first bottom nav:
  //   /?new=1          → start on a fresh scenario (the "+" button)
  //   /?view=compare   → open straight into the compare view
  // Lazy-initialised so we don't fight React 19's set-state-in-effect lint;
  // the effect below only strips the params from the URL after mount.
  const startNew = searchParams.get('new') === '1';
  const startCompare = searchParams.get('view') === 'compare';

  // Local copy of the scenarios list so save/duplicate/delete update the
  // selector without a full route refresh.
  const [scenarios, setScenarios] = useState<Scenario[]>(initialScenarios);
  const [selectedId, setSelectedId] = useState<string | 'new'>(
    startNew ? 'new' : (initialScenarios[0]?.id ?? 'new'),
  );
  const [assumptions, setAssumptions] = useState<Assumptions>(
    startNew ? defaultAssumptions() : (initialScenarios[0]?.assumptions ?? defaultAssumptions()),
  );
  const [name, setName] = useState<string>(
    startNew ? 'Untitled scenario' : (initialScenarios[0]?.name ?? 'Untitled scenario'),
  );
  const [displayMode, setDisplayMode] = useState<'nominal' | 'real'>('nominal');
  const [showTable, setShowTable] = useState(false);
  const [view, setView] = useState<'edit' | 'compare'>(startCompare ? 'compare' : 'edit');

  // Strip the one-shot deep-link params so a refresh doesn't re-trigger them.
  useEffect(() => {
    if (startNew || startCompare) router.replace('/');
    // Only needs to run once on mount for the initial params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [prefilling, setPrefilling] = useState(false);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);

  // Result recomputes whenever assumptions change. Pure math, fine on
  // every render — no debounce needed for typical horizon sizes.
  const result = useMemo(() => {
    try {
      return simulate(assumptions);
    } catch (err) {
      console.warn('[simulator] simulate failed', err);
      return null;
    }
  }, [assumptions]);

  function onScenarioChange(id: string) {
    setSelectedId(id);
    setServerError(null);
    setStatusMsg(null);
    if (id === 'new') {
      setAssumptions(defaultAssumptions());
      setName('Untitled scenario');
      return;
    }
    const found = scenarios.find((s) => s.id === id);
    if (found) {
      setAssumptions(found.assumptions);
      setName(found.name);
    }
  }

  async function save() {
    setServerError(null);
    setStatusMsg(null);
    setSaving(true);
    try {
      if (selectedId === 'new') {
        const res = await fetch('/api/scenarios', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, assumptions }),
        });
        if (!res.ok) {
          setServerError(res.status === 400 ? 'Invalid scenario — fix inputs.' : 'Save failed.');
          return;
        }
        const json = (await res.json()) as { scenario: Scenario };
        setScenarios((arr) => [json.scenario, ...arr]);
        setSelectedId(json.scenario.id);
        setStatusMsg('Saved.');
      } else {
        const res = await fetch(`/api/scenarios/${selectedId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, assumptions }),
        });
        if (!res.ok) {
          setServerError(res.status === 400 ? 'Invalid scenario — fix inputs.' : 'Save failed.');
          return;
        }
        const json = (await res.json()) as { scenario: Scenario };
        setScenarios((arr) => arr.map((s) => (s.id === json.scenario.id ? json.scenario : s)));
        setStatusMsg('Saved.');
      }
    } catch {
      setServerError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  async function saveAsNew() {
    setServerError(null);
    setStatusMsg(null);
    setSaving(true);
    try {
      const copyName = `${name} (copy)`.slice(0, 80);
      const res = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: copyName, assumptions }),
      });
      if (!res.ok) {
        setServerError(res.status === 400 ? 'Invalid scenario — fix inputs.' : 'Save failed.');
        return;
      }
      const json = (await res.json()) as { scenario: Scenario };
      setScenarios((arr) => [json.scenario, ...arr]);
      setSelectedId(json.scenario.id);
      setName(json.scenario.name);
      setStatusMsg('Saved as new.');
    } catch {
      setServerError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  async function prefillFromActuals() {
    setPrefillNote(null);
    setServerError(null);
    setPrefilling(true);
    try {
      const [nwRes, cfRes] = await Promise.all([
        fetch('/api/networth'),
        fetch('/api/derived/cashflow'),
      ]);
      if (!nwRes.ok || !cfRes.ok) {
        setServerError('Could not load your actual data.');
        return;
      }
      const nw = (await nwRes.json()) as {
        current: { total: number; invested?: number };
      };
      const cf = (await cfRes.json()) as {
        summary: {
          monthsObserved: number;
          annualBaselineExpenses: number;
          annualSavingsRatePct: number;
        };
      };
      const total = Number.isFinite(nw.current.total) ? nw.current.total : 0;
      const invested = Number.isFinite(nw.current.invested ?? NaN)
        ? (nw.current.invested as number)
        : 0;
      setAssumptions((a) => ({
        ...a,
        startingNetWorth: total,
        startingInvested: Math.max(0, Math.min(total, invested)),
        recurringAnnualExpenses: Math.max(0, Math.round(cf.summary.annualBaselineExpenses)),
        annualSavingsRatePct: Number(cf.summary.annualSavingsRatePct.toFixed(1)),
      }));
      setPrefillNote(
        `Prefilled from your last ${cf.summary.monthsObserved} month${cf.summary.monthsObserved === 1 ? '' : 's'} of transactions.`,
      );
    } catch {
      setServerError('Network error during prefill.');
    } finally {
      setPrefilling(false);
    }
  }

  async function deleteCurrent() {
    if (selectedId === 'new') return;
    if (!confirm(`Delete scenario “${name}”? This can't be undone.`)) return;
    setServerError(null);
    setStatusMsg(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/scenarios/${selectedId}`, { method: 'DELETE' });
      if (!res.ok) {
        setServerError('Delete failed.');
        return;
      }
      const remaining = scenarios.filter((s) => s.id !== selectedId);
      setScenarios(remaining);
      if (remaining[0]) {
        setSelectedId(remaining[0].id);
        setAssumptions(remaining[0].assumptions);
        setName(remaining[0].name);
      } else {
        setSelectedId('new');
        setAssumptions(defaultAssumptions());
        setName('Untitled scenario');
      }
      router.refresh();
    } catch {
      setServerError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  const lastNominal = result?.rows[result.rows.length - 1]?.netWorth ?? 0;
  const lastReal = result?.rows[result.rows.length - 1]?.netWorthRealTodayDollars ?? 0;
  const firstNominal = result?.rows[0]?.netWorth ?? 0;
  const totalGrowth = firstNominal > 0 ? (lastNominal / firstNominal - 1) * 100 : 0;

  // Markers: one dot per windfall and per active major-expense year, placed
  // on the BASE line at that year's value.
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
        'year' in e
          ? [e.year]
          : Array.from({ length: e.years }, (_, i) => e.startYear + i);
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

  // Years to highlight in the table — career-stage starts, windfalls,
  // and active major-expense years.
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

  if (view === 'compare') {
    return <CompareView scenarios={scenarios} onExit={() => setView('edit')} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Scenario selector + name + save controls */}
      <div className="flex flex-col gap-2">
        <label className="text-muted text-[10px] tracking-[0.18em] uppercase">Scenario</label>
        <select
          className="border-border bg-background rounded border px-3 py-2 text-sm"
          value={selectedId}
          onChange={(e) => onScenarioChange(e.target.value)}
        >
          <option value="new">+ New scenario</option>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <label className="text-muted mt-1 text-[10px] tracking-[0.18em] uppercase">Name</label>
        <input
          type="text"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          className="border-border focus:border-foreground rounded border bg-transparent px-3 py-2 text-sm outline-none"
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving || name.trim().length === 0}
            className="bg-foreground text-background rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : selectedId === 'new' ? 'Save' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={saveAsNew}
            disabled={saving}
            className="border-border hover:bg-foreground/5 rounded border px-3 py-1.5 text-xs disabled:opacity-50"
          >
            Save as new
          </button>
          {selectedId !== 'new' ? (
            <button
              type="button"
              onClick={deleteCurrent}
              disabled={saving}
              className="text-muted hover:text-negative text-xs disabled:opacity-50"
            >
              Delete
            </button>
          ) : null}
          {scenarios.length >= 1 ? (
            <button
              type="button"
              onClick={() => setView('compare')}
              disabled={saving}
              className="text-muted hover:text-foreground text-xs disabled:opacity-50"
            >
              Compare →
            </button>
          ) : null}
          {statusMsg ? <span className="text-positive text-[11px]">{statusMsg}</span> : null}
          {serverError ? <span className="text-negative text-[11px]">{serverError}</span> : null}
        </div>
      </div>

      {/* Live summary at the top so the form edits feel responsive. */}
      <section className="border-border rounded border p-4">
        <p className="text-muted text-[10px] tracking-[0.18em] uppercase">
          Final balance · {assumptions.horizonEndYear}
        </p>
        <p className="serif-display nums mt-1 text-3xl">{fmtCurrency0(lastNominal)}</p>
        <p className="text-muted nums mt-1 text-xs">
          {fmtCurrency0(lastReal)} in today&apos;s dollars · {fmtPct(totalGrowth)} over horizon
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={prefillFromActuals}
            disabled={prefilling}
            className="border-border hover:bg-foreground/5 rounded border px-3 py-1 text-xs disabled:opacity-50"
          >
            {prefilling ? 'Loading…' : 'Use my actual data'}
          </button>
          {prefillNote ? <span className="text-muted text-[10px]">{prefillNote}</span> : null}
        </div>
      </section>

      {/* Chart + nominal/real toggle. */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-muted text-[10px] tracking-[0.18em] uppercase">
            Projection · low–high band
          </p>
          <div className="border-border flex rounded border text-[11px]">
            <button
              type="button"
              onClick={() => setDisplayMode('nominal')}
              className={`px-2.5 py-1 ${displayMode === 'nominal' ? 'bg-foreground/10 text-foreground' : 'text-muted'}`}
            >
              Nominal
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('real')}
              className={`px-2.5 py-1 ${displayMode === 'real' ? 'bg-foreground/10 text-foreground' : 'text-muted'}`}
            >
              Real
            </button>
          </div>
        </div>
        {result ? (
          <SimulatorChart result={result} mode={displayMode} markers={markers} />
        ) : (
          <p className="text-negative text-xs">Could not compute projection — check inputs.</p>
        )}
        <p className="text-muted text-[10px]">
          Band = pessimistic to optimistic return. Green dots are windfall
          years; red dots are major-expense years.
        </p>
      </section>

      {/* Year-by-year table. */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-muted text-[10px] tracking-[0.18em] uppercase">
            Year by year
          </p>
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="text-muted hover:text-foreground text-xs"
          >
            {showTable ? 'Hide table' : 'Show table'}
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

      {/* Goal-seek target + levers panel. */}
      <GoalSeekPanel assumptions={assumptions} onChange={setAssumptions} />

      {/* The big assumptions form. */}
      <AssumptionsForm value={assumptions} onChange={setAssumptions} />

      <p className="text-muted text-[10px] italic">
        Estimates based on your assumptions. Not a prediction or financial
        advice. Career preset salaries are illustrative defaults, not market
        data — replace with your own figures.
      </p>
    </div>
  );
}
