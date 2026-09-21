'use client';

import { useEffect, useState } from 'react';

import {
  buildBackup,
  parseBackup,
  type BackupScenario,
  type RestoreResult,
} from '@/lib/backup/backup';
import {
  currentEmail,
  deleteVault,
  fetchVault,
  isEmail,
  onAuthChange,
  saveVault,
  sendCode,
  signOut,
  verifyCode,
  type RemoteVault,
} from '@/lib/cloud/client';
import {
  decrypt,
  deriveKey,
  encrypt,
  KDF_ITERATIONS,
  MIN_PASSPHRASE_LENGTH,
  newSalt,
  WrongPassphraseError,
} from '@/lib/cloud/crypto';
import { useI18n } from '@/lib/i18n/locale';
import type { MonthEntry } from '@/lib/ledger/ledger';

import Icon from '../ui/icon';

/**
 * Optional account + end-to-end-encrypted sync.
 *
 * Deliberately MANUAL: "Upload" and "Download", each explicit, download
 * behind the same confirm as a file restore. Auto-merging two devices'
 * finances is how sync silently destroys data; a button is honest.
 *
 * The key lives in React state only — never storage. Signing out, closing
 * the tab or reloading forgets it, and the passphrase is asked for again.
 */

type Ok = Extract<RestoreResult, { ok: true }>;
type Unlocked = { key: CryptoKey; salt: string; iter: number };

export default function CloudSync({
  scenarios,
  selectedId,
  ledger,
  onRestore,
}: {
  scenarios: BackupScenario[];
  selectedId: string;
  ledger: MonthEntry[];
  onRestore: (r: Ok) => void;
}) {
  const { t, locale } = useI18n();
  const C = t.cloud;
  const [email, setEmail] = useState<string | null | undefined>(undefined); // undefined = loading
  const [emailInput, setEmailInput] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [remote, setRemote] = useState<RemoteVault | null | undefined>(undefined);
  const [unlocked, setUnlocked] = useState<Unlocked | null>(null);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [pending, setPending] = useState<Ok | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const bad = (text: string) => setNote({ tone: 'bad', text });
  const good = (text: string) => setNote({ tone: 'ok', text });

  useEffect(() => {
    let off: (() => void) | undefined;
    let alive = true;
    void currentEmail()
      .then((e) => alive && setEmail(e))
      .catch(() => alive && setEmail(null));
    void onAuthChange((e) => {
      if (!alive) return;
      setEmail(e);
      if (!e) {
        // Signed out: forget the key and everything derived from the account.
        setUnlocked(null);
        setRemote(undefined);
        setPending(null);
      }
    }).then((fn) => {
      if (alive) off = fn;
      else fn();
    });
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  useEffect(() => {
    if (!email) return;
    let alive = true;
    void fetchVault()
      .then((v) => alive && setRemote(v))
      .catch(() => alive && bad(C.err.network));
    return () => {
      alive = false;
    };
    // C is stable per locale; refetching on language change is pointless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      bad(e instanceof WrongPassphraseError ? C.err.wrongPass : C.err.network);
    } finally {
      setBusy(false);
    }
  }

  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));

  // ---------- signed out ----------
  if (email === undefined) return null;
  if (email === null) {
    return (
      <section className="card">
        <Header title={C.heading} />
        <p className="text-muted mb-3 text-xs">{C.pitch}</p>
        {!codeSent ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const addr = emailInput.trim().toLowerCase();
              if (!isEmail(addr)) return bad(C.err.email);
              void run(async () => {
                await sendCode(addr);
                setEmailInput(addr);
                setCodeSent(true);
                good(C.codeSent(addr));
              });
            }}
          >
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder={C.emailPlaceholder}
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="field"
            />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {C.sendCode}
            </button>
          </form>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const c = code.replace(/\s/g, '');
              if (!/^\d{6,10}$/.test(c)) return bad(C.err.code);
              void run(async () => {
                await verifyCode(emailInput, c);
                setCode('');
                setCodeSent(false);
              });
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={C.codePlaceholder}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="field nums tracking-[0.3em]"
            />
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary flex-1" disabled={busy}>
                {C.verify}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setCodeSent(false)}>
                {C.changeEmail}
              </button>
            </div>
          </form>
        )}
        <Note note={note} />
      </section>
    );
  }

  // ---------- signed in ----------
  const creating = remote === null; // no vault yet → choose a passphrase
  return (
    <section className="card">
      <div className="mb-1 flex items-center justify-between gap-3">
        <Header title={C.heading} />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void run(async () => signOut())}
          disabled={busy}
        >
          {C.signOut}
        </button>
      </div>
      <p className="text-muted mb-3 truncate text-xs">{C.signedInAs(email)}</p>

      {remote === undefined ? (
        <p className="text-muted text-xs">{C.loading}</p>
      ) : !unlocked ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (pass.length < MIN_PASSPHRASE_LENGTH)
              return bad(C.err.passShort(MIN_PASSPHRASE_LENGTH));
            if (creating && pass !== pass2) return bad(C.err.passMismatch);
            void run(async () => {
              const salt = remote ? remote.envelope.salt : newSalt();
              const iter = remote ? remote.envelope.iter : KDF_ITERATIONS;
              const key = await deriveKey(pass, salt, iter);
              // Existing vault: prove the passphrase before calling it unlocked.
              if (remote) await decrypt(remote.envelope, key);
              setUnlocked({ key, salt, iter });
              setPass('');
              setPass2('');
              good(creating ? C.passCreated : C.unlockedNote);
            });
          }}
        >
          <p className="text-[13px]">{creating ? C.createPass : C.enterPass}</p>
          <input
            type="password"
            autoComplete={creating ? 'new-password' : 'current-password'}
            placeholder={C.passPlaceholder}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="field"
          />
          {creating ? (
            <input
              type="password"
              autoComplete="new-password"
              placeholder={C.passAgain}
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              className="field"
            />
          ) : null}
          <p className="text-negative text-xs">{C.passWarning}</p>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? C.deriving : creating ? C.createPassBtn : C.unlock}
          </button>
        </form>
      ) : (
        <>
          <ul className="rows">
            <li className="row items-center">
              <span className="text-[13px]">{C.cloudCopy}</span>
              <span className="nums text-right text-[13px]">
                {remote ? when(remote.updatedAt) : C.none}
              </span>
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setConflict(false);
                  const text = JSON.stringify(buildBackup(scenarios, selectedId, ledger));
                  const env = await encrypt(text, unlocked.key, unlocked.salt, unlocked.iter);
                  const res = await saveVault(env, remote?.updatedAt ?? null);
                  if (!res.ok) return setConflict(true);
                  setRemote({ envelope: env, updatedAt: res.updatedAt });
                  good(C.uploaded);
                })
              }
            >
              {C.upload}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !remote}
              onClick={() =>
                void run(async () => {
                  const latest = await fetchVault();
                  if (!latest) return bad(C.err.noCloud);
                  setRemote(latest);
                  const r = parseBackup(await decrypt(latest.envelope, unlocked.key));
                  if (!r.ok) return bad(C.err.unreadable);
                  setPending(r); // replaced only after the confirm below
                })
              }
            >
              {C.download}
            </button>
          </div>

          {conflict ? (
            <div className="bg-surface-2 mt-3 rounded-[10px] p-3">
              <p className="text-[13px]">{C.conflict}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void run(async () => {
                      const latest = await fetchVault();
                      setRemote(latest);
                      setConflict(false);
                      good(C.refreshed);
                    })
                  }
                >
                  {C.refresh}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConflict(false)}>
                  {C.cancel}
                </button>
              </div>
            </div>
          ) : null}

          {pending ? (
            <div className="bg-surface-2 mt-3 rounded-[10px] p-3">
              <p className="text-[13px]">
                {C.confirmDownload(
                  pending.scenarios.length,
                  pending.ledger.length,
                  scenarios.length,
                  ledger.length,
                )}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    onRestore(pending);
                    setPending(null);
                    good(C.downloaded);
                  }}
                >
                  {C.replace}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
                  {C.cancel}
                </button>
              </div>
            </div>
          ) : null}

          <hr className="rule my-4" />
          {!confirmDelete ? (
            <button
              type="button"
              className="btn btn-ghost px-0"
              disabled={!remote}
              onClick={() => setConfirmDelete(true)}
            >
              {C.deleteCloud}
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs">{C.deleteConfirm}</span>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void run(async () => {
                    await deleteVault();
                    setRemote(null);
                    setUnlocked(null);
                    setConfirmDelete(false);
                    good(C.deleted);
                  })
                }
              >
                {C.deleteYes}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmDelete(false)}
              >
                {C.cancel}
              </button>
            </div>
          )}
        </>
      )}
      <Note note={note} />
    </section>
  );
}

function Header({ title }: { title: string }) {
  return (
    <span className="eyebrow mb-1">
      <Icon name="spark" size={12} />
      {title}
    </span>
  );
}

function Note({ note }: { note: { tone: 'ok' | 'bad'; text: string } | null }) {
  if (!note) return null;
  return (
    <p className={`mt-2 text-xs ${note.tone === 'ok' ? 'text-positive' : 'text-negative'}`}>
      {note.text}
    </p>
  );
}
