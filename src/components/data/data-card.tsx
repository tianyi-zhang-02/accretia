'use client';

import { useEffect, useRef, useState } from 'react';

import {
  BACKUP_STALE_DAYS,
  backupFilename,
  buildBackup,
  daysSince,
  parseBackup,
  type BackupScenario,
  type RestoreResult,
} from '@/lib/backup/backup';
import { useI18n } from '@/lib/i18n/locale';
import type { MonthEntry } from '@/lib/ledger/ledger';

import PixelIcon from '../pixel/pixel-icon';

/**
 * "Your data" — where it lives, when it was last backed up, and the two
 * buttons that make the app safe to use for years: back up everything,
 * restore everything. Browser storage is not a vault, and this card is
 * where the app says so plainly instead of hoping nobody clears their
 * history.
 *
 * `navigator.storage.persist()` is only ever called from a click: Firefox
 * shows a permission prompt for it, and a prompt on first load is hostile.
 */

type Ok = Extract<RestoreResult, { ok: true }>;

export default function DataCard({
  scenarios,
  selectedId,
  ledger,
  saveLocal,
  lastBackupAt,
  onBackedUp,
  onRestore,
}: {
  scenarios: BackupScenario[];
  selectedId: string;
  ledger: MonthEntry[];
  saveLocal: boolean;
  lastBackupAt: string | null;
  onBackedUp: (iso: string) => void;
  onRestore: (r: Ok) => void;
}) {
  const { t } = useI18n();
  const D = t.data;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Ok | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  // null = unknown / unsupported.
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [canPersist, setCanPersist] = useState(false);

  useEffect(() => {
    const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!s?.persisted) return;
    let alive = true;
    void s.persisted().then((p) => {
      if (!alive) return;
      setPersisted(p);
      setCanPersist(typeof s.persist === 'function');
    });
    return () => {
      alive = false;
    };
  }, []);

  const days = daysSince(lastBackupAt);
  const stale = days === null || days >= BACKUP_STALE_DAYS;

  function backUp() {
    const now = new Date();
    const text = JSON.stringify(buildBackup(scenarios, selectedId, ledger, now), null, 2);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFilename(now);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    onBackedUp(now.toISOString());
    setNote({ tone: 'ok', text: D.backedUp });
  }

  async function pick(file: File) {
    setPending(null);
    if (file.size > 2_000_000) return setNote({ tone: 'bad', text: D.fail.tooLarge });
    let text: string;
    try {
      text = await file.text();
    } catch {
      return setNote({ tone: 'bad', text: D.fail.notJson });
    }
    const r = parseBackup(text);
    if (!r.ok) return setNote({ tone: 'bad', text: D.fail[r.reason] });
    setNote(null);
    setPending(r); // nothing is replaced until the user confirms
  }

  return (
    <section className="card">
      <span className="eyebrow mb-1">
        <PixelIcon name="shield" size={12} />
        {D.heading}
      </span>

      <ul className="rows">
        <li className="row items-center">
          <span className="text-[13px]">{D.stored}</span>
          <span className={`text-right text-[13px] ${saveLocal ? '' : 'text-negative'}`}>
            {saveLocal ? D.storedDevice : D.storedMemory}
          </span>
        </li>
        <li className="row items-center">
          <span className="text-[13px]">{D.lastBackup}</span>
          <span className={`nums text-right text-[13px] ${stale ? 'text-negative' : ''}`}>
            {days === null ? D.never : days === 0 ? D.today : D.daysAgo(days)}
          </span>
        </li>
        {persisted !== null ? (
          <li className="row items-center">
            <span className="text-[13px]">
              {D.protection}
              <span className="text-muted block text-[11px]">{D.protectionHint}</span>
            </span>
            {persisted ? (
              <span className="text-positive text-[13px]">{D.on}</span>
            ) : canPersist ? (
              <button
                type="button"
                className="btn shrink-0"
                onClick={() =>
                  void navigator.storage.persist().then((p) => {
                    setPersisted(p);
                    if (!p) setNote({ tone: 'bad', text: D.protectionDenied });
                  })
                }
              >
                {D.turnOn}
              </button>
            ) : (
              <span className="text-muted text-[13px]">{D.off}</span>
            )}
          </li>
        ) : null}
      </ul>

      <p className="text-muted mt-3 text-xs">{D.why}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={`btn ${stale ? 'btn-primary' : ''}`} onClick={backUp}>
          {D.backUp}
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          {D.restore}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
            e.target.value = '';
          }}
        />
      </div>

      {pending ? (
        <div className="bg-surface-2 mt-3 rounded-[10px] p-3">
          <p className="text-[13px]">
            {D.confirm(
              pending.scenarios.length,
              pending.ledger.length,
              scenarios.length,
              ledger.length,
            )}
          </p>
          {pending.droppedScenarios > 0 ? (
            <p className="text-negative mt-1 text-xs">{D.dropped(pending.droppedScenarios)}</p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onRestore(pending);
                setPending(null);
                setNote({ tone: 'ok', text: D.restored });
              }}
            >
              {D.replace}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
              {D.cancel}
            </button>
          </div>
        </div>
      ) : null}

      {note ? (
        <p className={`mt-2 text-xs ${note.tone === 'ok' ? 'text-positive' : 'text-negative'}`}>
          {note.text}
        </p>
      ) : null}
    </section>
  );
}
