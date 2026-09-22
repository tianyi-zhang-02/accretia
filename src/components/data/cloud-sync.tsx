'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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
  addRecoveryCode,
  createVault,
  MIN_PASSPHRASE_LENGTH,
  normalizeRecoveryCode,
  open,
  RECOVERY_CODE_LENGTH,
  seal,
  setPassphrase,
  unlock,
  WrongPassphraseError,
  type VaultKeys,
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
 *
 * A forgotten passphrase is survivable with the RECOVERY CODE handed out
 * when the passphrase is set (see crypto.ts): the code unlocks the vault,
 * after which a new passphrase must be chosen. Nothing here can recover a
 * vault without one of the two secrets — by design, and the copy says so.
 */

type Ok = Extract<RestoreResult, { ok: true }>;

/** Supabase throttles sign-in emails to one a minute per address. */
const RESEND_SECONDS = 60;

/** What "the same data" means for the upload-needed indicator. */
const signature = (scenarios: BackupScenario[], ledger: MonthEntry[]) =>
  JSON.stringify({ scenarios, ledger });

/** 0 too short · 1 okay · 2 strong. Length is what matters for a passphrase. */
const strengthOf = (pass: string) =>
  pass.length < MIN_PASSPHRASE_LENGTH ? 0 : pass.length < 20 ? 1 : 2;

export default function CloudSync({
  scenarios,
  selectedId,
  ledger,
  arrival,
  onAuth,
  onRestore,
}: {
  scenarios: BackupScenario[];
  selectedId: string;
  ledger: MonthEntry[];
  /** Set when the page was opened from a sign-in email: it worked, or the link was dead. */
  arrival: 'ok' | 'failed' | null;
  /** Tells the app shell who is signed in (for the header), or null. */
  onAuth: (email: string | null) => void;
  onRestore: (r: Ok) => void;
}) {
  const { t, locale } = useI18n();
  const C = t.cloud;
  const [email, setEmail] = useState<string | null | undefined>(undefined); // undefined = loading
  const [emailInput, setEmailInput] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [remote, setRemote] = useState<RemoteVault | null | undefined>(undefined);
  const [unlocked, setUnlocked] = useState<VaultKeys | null>(null);
  // Locked step: passphrase, or the recovery-code path behind "I forgot".
  const [forgot, setForgot] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  // A freshly minted code, shown until the person says they've saved it.
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Change-passphrase form, opened by choice from the unlocked view.
  const [changingPass, setChangingPass] = useState(false);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [pending, setPending] = useState<Ok | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [useCode, setUseCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [showPass, setShowPass] = useState(false);
  // Signature of the data as of the last upload / download, to say whether
  // this device has anything the cloud doesn't. Memory only, like the key.
  const [syncedSig, setSyncedSig] = useState<string | null>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const currentSig = useMemo(() => signature(scenarios, ledger), [scenarios, ledger]);

  const bad = (text: string) => setNote({ tone: 'bad', text });
  const good = (text: string) => setNote({ tone: 'ok', text });

  useEffect(() => {
    let off: (() => void) | undefined;
    let alive = true;
    void currentEmail()
      .then((e) => {
        if (!alive) return;
        setEmail(e);
        onAuth(e);
      })
      .catch(() => alive && setEmail(null));
    void onAuthChange((e) => {
      if (!alive) return;
      setEmail(e);
      onAuth(e);
      if (e) {
        // Signed in (here, or by opening the link in another tab).
        setCodeSent(false);
        setUseCode(false);
        setCode('');
      }
      if (!e) {
        // Signed out: forget the key and everything derived from the account.
        setUnlocked(null);
        setRemote(undefined);
        setPending(null);
        setSyncedSig(null);
        setFreshCode(null);
        setForgot(false);
        setChangingPass(false);
      }
    }).then((fn) => {
      if (alive) off = fn;
      else fn();
    });
    return () => {
      alive = false;
      off?.();
    };
    // `onAuth` is a state setter from the shell — stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One tick a second while the resend button is cooling down.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  // Straight from the email to the next thing to do.
  useEffect(() => {
    if (email && remote !== undefined && !unlocked) passRef.current?.focus();
  }, [email, remote, unlocked]);

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
      const status = (e as { status?: unknown } | null)?.status;
      bad(
        e instanceof WrongPassphraseError
          ? C.err.wrongPass
          : status === 429
            ? C.err.rate
            : C.err.network,
      );
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
    const send = (addr: string, again: boolean) =>
      run(async () => {
        await sendCode(addr);
        setEmailInput(addr);
        setCodeSent(true);
        setCooldown(RESEND_SECONDS);
        if (again) good(C.resent);
      });
    return (
      <section className="card">
        <Header title={C.heading} />
        <Steps labels={C.steps} current={codeSent ? 1 : 0} />
        {!codeSent ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const addr = emailInput.trim().toLowerCase();
              if (!isEmail(addr)) return bad(C.err.email);
              void send(addr, false);
            }}
          >
            {arrival === 'failed' && !note ? (
              <p className="text-negative text-[13px]">{C.err.linkExpired}</p>
            ) : (
              <p className="text-muted text-[13px]">{C.pitch}</p>
            )}
            <label className="mt-1 flex flex-col gap-1">
              <span className="text-[13px] font-medium">{C.emailLabel}</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={C.emailPlaceholder}
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="field h-12"
              />
            </label>
            <button type="submit" className="btn btn-primary h-11" disabled={busy}>
              {busy ? C.deriving : C.sendCode}
            </button>
            <p className="text-muted text-xs">{C.noPassword}</p>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <p className="display text-lg">{C.inboxTitle}</p>
              <p className="text-muted mt-1 text-[13px]">{C.inboxBody(emailInput)}</p>
            </div>
            <p className="text-muted flex items-center gap-2 text-xs">
              <span className="bg-accent inline-block h-2 w-2 animate-pulse rounded-full" />
              {C.waiting}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn"
                disabled={busy || cooldown > 0}
                onClick={() => void send(emailInput, true)}
              >
                {cooldown > 0 ? C.resendIn(cooldown) : C.resend}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setCodeSent(false);
                  setUseCode(false);
                  setNote(null);
                }}
              >
                {C.changeEmail}
              </button>
            </div>
            <p className="text-muted text-xs">{C.spamHint}</p>

            {!useCode ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm self-start px-0"
                onClick={() => setUseCode(true)}
              >
                {C.haveCode} ›
              </button>
            ) : (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const c = code.replace(/\s/g, '');
                  if (!/^\d{6,10}$/.test(c)) return bad(C.err.code);
                  setBusy(true);
                  setNote(null);
                  verifyCode(emailInput, c)
                    .then(() => setCode(''))
                    .catch(() => bad(C.err.codeWrong))
                    .finally(() => setBusy(false));
                }}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={C.codePlaceholder}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="field nums min-w-0 flex-1 tracking-[0.3em]"
                />
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {C.verify}
                </button>
              </form>
            )}
          </div>
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
      {!unlocked ? <Steps labels={C.steps} current={2} /> : null}

      {remote === undefined ? (
        <p className="text-muted text-xs">{C.loading}</p>
      ) : !unlocked && forgot && remote ? (
        // ---- forgot: unlock with the recovery code ----
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!normalizeRecoveryCode(recoveryInput))
              return bad(C.err.recoveryFormat(RECOVERY_CODE_LENGTH));
            setBusy(true);
            setNote(null);
            unlock(remote.envelope, { recoveryCode: recoveryInput })
              .then(async (vault) => {
                if (vault.v !== 2) throw new WrongPassphraseError();
                const r = parseBackup(await open(remote.envelope, vault));
                setSyncedSig(r.ok ? signature(r.scenarios, r.ledger) : null);
                // The old passphrase is retired: a new one must be chosen.
                setUnlocked({ ...vault, pass: null });
                setRecoveryInput('');
                setForgot(false);
                good(C.recovered);
              })
              .catch((err: unknown) =>
                bad(err instanceof WrongPassphraseError ? C.err.recoveryWrong : C.err.network),
              )
              .finally(() => setBusy(false));
          }}
        >
          <p className="display text-lg">{C.forgotTitle}</p>
          {remote.envelope.v === 2 && remote.envelope.keys.recovery ? (
            <>
              <p className="text-muted text-[13px]">{C.forgotBody}</p>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={C.recoveryPlaceholder}
                value={recoveryInput}
                onChange={(e) => setRecoveryInput(e.target.value)}
                className="field nums h-12 font-mono text-[15px] tracking-wider"
              />
              <button type="submit" className="btn btn-primary h-11" disabled={busy}>
                {busy ? C.deriving : C.recoverBtn}
              </button>
            </>
          ) : (
            <p className="text-muted text-[13px]">{C.noCodeLegacy}</p>
          )}
          <p className="text-muted mt-2 text-xs">{C.noCode}</p>
          {!confirmDelete ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm self-start px-0"
              onClick={() => setConfirmDelete(true)}
            >
              {C.startOver} ›
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
                    setConfirmDelete(false);
                    setForgot(false);
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
          <button
            type="button"
            className="btn btn-ghost self-start"
            onClick={() => {
              setForgot(false);
              setNote(null);
            }}
          >
            ‹ {C.back}
          </button>
        </form>
      ) : !unlocked || (unlocked.v === 2 && unlocked.pass === null) || changingPass ? (
        // ---- passphrase: create (new vault), enter (existing), or set anew ----
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const settingNew = creating || unlocked !== null; // new vault, after recovery, or by choice
            if (pass.length < MIN_PASSPHRASE_LENGTH)
              return bad(C.err.passShort(MIN_PASSPHRASE_LENGTH));
            if (settingNew && pass !== pass2) return bad(C.err.passMismatch);
            void run(async () => {
              if (unlocked) {
                // Re-wrap the data key under the new passphrase (v2 only).
                if (unlocked.v !== 2) return bad(C.legacyChange);
                setUnlocked(await setPassphrase(unlocked, pass));
                setSyncedSig(null); // the cloud copy still carries the old wrap
                setChangingPass(false);
                good(C.passChanged);
              } else if (creating) {
                const { vault, recoveryCode } = await createVault(pass);
                setUnlocked(vault);
                setFreshCode(recoveryCode);
                good(C.passCreated);
              } else {
                const vault = await unlock(remote!.envelope, { passphrase: pass });
                // …and while the plaintext is in hand, note whether this device
                // already matches it.
                const r = parseBackup(await open(remote!.envelope, vault));
                setSyncedSig(r.ok ? signature(r.scenarios, r.ledger) : null);
                setUnlocked(vault);
                good(C.unlockedNote);
              }
              setPass('');
              setPass2('');
            });
          }}
        >
          {arrival === 'ok' && !unlocked ? (
            <p className="text-positive text-[13px]">{creating ? C.welcome : C.welcomeBack}</p>
          ) : null}
          <p className="text-[13px]">
            {unlocked ? C.newPassLabel : creating ? C.createPass : C.enterPass}
          </p>
          <input
            ref={passRef}
            type={showPass ? 'text' : 'password'}
            autoComplete={creating || unlocked ? 'new-password' : 'current-password'}
            placeholder={C.passPlaceholder}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="field h-12"
          />
          {creating || unlocked ? (
            <>
              <input
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={C.passAgain}
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                className="field h-12"
              />
              {pass ? (
                <div className="flex items-center gap-2">
                  <span className="bg-surface-2 flex h-1.5 flex-1 gap-0.5 overflow-hidden rounded-full">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className={`h-full flex-1 ${
                          i <= strengthOf(pass)
                            ? strengthOf(pass) === 0
                              ? 'bg-negative'
                              : 'bg-positive'
                            : ''
                        }`}
                      />
                    ))}
                  </span>
                  <span className="text-muted text-[11px]">{C.strength[strengthOf(pass)]}</span>
                </div>
              ) : null}
            </>
          ) : null}
          <label className="text-muted flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={showPass}
              onChange={(e) => setShowPass(e.target.checked)}
            />
            {C.showPass}
          </label>
          {creating ? <p className="text-negative text-xs">{C.passWarning}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? C.deriving : unlocked ? C.setPassBtn : creating ? C.createPassBtn : C.unlock}
          </button>
          {!unlocked && remote ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm self-start px-0"
              onClick={() => {
                setForgot(true);
                setNote(null);
              }}
            >
              {C.forgot} ›
            </button>
          ) : null}
          {changingPass ? (
            <button
              type="button"
              className="btn btn-ghost self-start"
              onClick={() => {
                setChangingPass(false);
                setPass('');
                setPass2('');
              }}
            >
              ‹ {C.back}
            </button>
          ) : null}
        </form>
      ) : (
        <>
          {freshCode ? (
            <div className="bg-surface-2 mb-4 rounded-[12px] p-4">
              <p className="display text-lg">{C.codeTitle}</p>
              <p className="text-muted mt-1 text-[13px]">{C.codeBody}</p>
              <p className="nums my-3 rounded-[10px] bg-[var(--background)] px-3 py-3 text-center font-mono text-[15px] tracking-wider break-all select-all">
                {freshCode}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void navigator.clipboard?.writeText(freshCode).then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    })
                  }
                >
                  {copied ? C.copied : C.copy}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const text = C.codeFileBody(t.app.title, email) + freshCode + '\n';
                    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'work-optional-recovery-code.txt';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.setTimeout(() => URL.revokeObjectURL(url), 0);
                  }}
                >
                  {C.saveCodeFile}
                </button>
                <button
                  type="button"
                  className="btn btn-primary ml-auto"
                  onClick={() => setFreshCode(null)}
                >
                  {C.savedIt}
                </button>
              </div>
              <p className="text-muted mt-2 text-[11px]">{C.codeUploadNote}</p>
            </div>
          ) : null}
          <ul className="rows">
            <li className="row items-center">
              <span className="text-[13px]">{C.cloudCopy}</span>
              <span className="nums text-right text-[13px]">
                {remote ? when(remote.updatedAt) : C.none}
              </span>
            </li>
            <li className="row items-center">
              <span className="text-[13px]">{C.thisDevice}</span>
              <span
                className={`text-right text-[13px] ${
                  remote && syncedSig === currentSig ? 'text-positive' : 'text-muted'
                }`}
              >
                {!remote ? C.neverUploaded : syncedSig === currentSig ? C.inSync : C.needsUpload}
              </span>
            </li>
            <li className="row items-center">
              <span className="text-[13px]">{C.recoveryRow}</span>
              <span className="flex items-center gap-2 text-[13px]">
                <span
                  className={unlocked.v === 2 && unlocked.recovery ? 'text-positive' : 'text-muted'}
                >
                  {unlocked.v === 2 && unlocked.recovery ? C.recoverySet : C.recoveryNone}
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy || !!freshCode}
                  title={unlocked.v === 2 && unlocked.recovery ? C.newCodeHint : undefined}
                  onClick={() =>
                    void run(async () => {
                      const { vault, recoveryCode } = await addRecoveryCode(unlocked);
                      setUnlocked(vault);
                      setFreshCode(recoveryCode);
                      setSyncedSig(null); // the cloud copy must be re-uploaded to carry it
                    })
                  }
                >
                  {unlocked.v === 2 && unlocked.recovery ? C.newCode : C.addCode}
                </button>
              </span>
            </li>
            <li className="row items-center">
              <span className="text-[13px]">{C.passRow}</span>
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => (unlocked.v === 2 ? setChangingPass(true) : bad(C.legacyChange))}
              >
                {C.changePass}
              </button>
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
                  const env = await seal(text, unlocked);
                  const res = await saveVault(env, remote?.updatedAt ?? null);
                  if (!res.ok) return setConflict(true);
                  setRemote({ envelope: env, updatedAt: res.updatedAt });
                  setSyncedSig(currentSig);
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
                  const r = parseBackup(await open(latest.envelope, unlocked));
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
                    setSyncedSig(signature(pending.scenarios, pending.ledger));
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
                    setSyncedSig(null);
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

/** Where you are in signing in: email → open the link → passphrase. */
function Steps({ labels, current }: { labels: readonly string[]; current: number }) {
  return (
    <ol className="mt-2 mb-4 flex items-center gap-2 text-[11px]">
      {labels.map((label, i) => (
        <li
          key={label}
          aria-current={i === current ? 'step' : undefined}
          className={`flex min-w-0 items-center gap-1.5 ${
            i === current ? 'text-foreground' : 'text-muted'
          }`}
        >
          <span
            className={`nums flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
              i < current
                ? 'bg-positive text-background'
                : i === current
                  ? 'bg-foreground text-background'
                  : 'bg-surface-2'
            }`}
          >
            {i < current ? '✓' : i + 1}
          </span>
          <span className="truncate">{label}</span>
          {i < labels.length - 1 ? <span className="text-muted pl-0.5">›</span> : null}
        </li>
      ))}
    </ol>
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
