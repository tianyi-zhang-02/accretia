'use client';

import { useState } from 'react';
import Link from 'next/link';

import {
  CURRENT_ITERATIONS,
  decryptBackup,
  encryptBackup,
  isEncryptedBackup,
  type EncryptedBackup,
  type PlainBackup,
} from '@/lib/crypto/backup';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function downloadBlob(data: string, filename: string, mime: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment before revoking so the download has the URL.
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

type DecryptedPreview = {
  payload: PlainBackup;
  filename: string;
  wasEncrypted: boolean;
};

export default function ExportClient() {
  // --- Export state ---
  const [encryptPass, setEncryptPass] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);

  // --- Import state ---
  const [importFile, setImportFile] = useState<File | null>(null);
  const [fileLooksEncrypted, setFileLooksEncrypted] = useState(false);
  const [decryptPass, setDecryptPass] = useState('');
  const [decrypting, setDecrypting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DecryptedPreview | null>(null);

  async function onExportBackup() {
    setExportError(null);
    setExportNote(null);
    setExporting(true);
    try {
      const res = await fetch('/api/export/backup.json');
      if (!res.ok) {
        setExportError(
          res.status === 401
            ? 'Session expired. Sign in again and retry.'
            : 'Could not fetch backup.',
        );
        return;
      }
      const payload = (await res.json()) as PlainBackup;

      if (encryptPass.length === 0) {
        // Plain path — what /api/export/backup.json already returned.
        downloadBlob(
          JSON.stringify(payload, null, 2),
          `tracker-backup-${todayIso()}.json`,
          'application/json',
        );
        setExportNote('Plain JSON downloaded.');
        return;
      }

      const envelope = await encryptBackup(payload, encryptPass);
      downloadBlob(
        JSON.stringify(envelope, null, 2),
        `tracker-backup-${todayIso()}.enc.json`,
        'application/json',
      );
      setExportNote(
        `Encrypted backup downloaded. PBKDF2 · ${envelope.iterations.toLocaleString()} iters.`,
      );
      // Don't clear the field — user may want to export multiple variants
      // (CSV + encrypted JSON) without retyping.
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setExporting(false);
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    setPreview(null);
    const file = e.target.files?.[0] ?? null;
    setImportFile(file);
    if (!file) {
      setFileLooksEncrypted(false);
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      setFileLooksEncrypted(isEncryptedBackup(parsed));
    } catch {
      setImportError('That file isn’t valid JSON.');
      setFileLooksEncrypted(false);
    }
  }

  async function onDecrypt() {
    if (!importFile) return;
    setImportError(null);
    setPreview(null);
    setDecrypting(true);
    try {
      const text = await importFile.text();
      const parsed = JSON.parse(text) as unknown;

      if (isEncryptedBackup(parsed)) {
        if (decryptPass.length === 0) {
          setImportError('Passphrase required for this file.');
          return;
        }
        const decoded = await decryptBackup(parsed as EncryptedBackup, decryptPass);
        setPreview({
          payload: decoded,
          filename: importFile.name.replace(/\.enc\.json$/i, '.decrypted.json'),
          wasEncrypted: true,
        });
      } else {
        // Plain backup — nothing to decrypt, just preview.
        setPreview({
          payload: parsed as PlainBackup,
          filename: importFile.name,
          wasEncrypted: false,
        });
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not decrypt.');
    } finally {
      setDecrypting(false);
    }
  }

  function onDownloadDecrypted() {
    if (!preview) return;
    downloadBlob(
      JSON.stringify(preview.payload, null, 2),
      preview.filename,
      'application/json',
    );
  }

  function resetImport() {
    setImportFile(null);
    setFileLooksEncrypted(false);
    setDecryptPass('');
    setImportError(null);
    setPreview(null);
  }

  return (
    <>
      <header>
        <Link href="/settings" className="text-muted hover:text-foreground text-xs">
          ← Settings
        </Link>
        <h1 className="serif-display mt-1 text-3xl">Export</h1>
        <p className="text-muted mt-2 text-sm">
          Take your data with you. CSVs are ready for spreadsheets; the JSON
          backup is the canonical &quot;your data is yours&quot; snapshot
          covering every table.
        </p>
      </header>

      {/* Encryption passphrase — applies only to the JSON backup download. */}
      <section className="border-border flex flex-col gap-3 rounded border p-4">
        <p className="text-muted text-[10px] tracking-[0.18em] uppercase">
          Backup encryption (optional)
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-muted text-xs">
            Passphrase — encrypts the JSON backup below in your browser before download.
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={encryptPass}
            onChange={(e) => setEncryptPass(e.target.value)}
            placeholder="Leave blank to download plain JSON"
            className="border-border focus:border-foreground placeholder:text-muted/50 rounded border bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>
        <p className="text-negative text-[11px]">
          <strong>If you lose this passphrase, the backup cannot be recovered.</strong>{' '}
          The passphrase never leaves this page — no server route, no analytics, nothing.
        </p>
        <p className="text-muted text-[10px]">
          AES-256-GCM with PBKDF2 ({CURRENT_ITERATIONS.toLocaleString()} iterations,
          SHA-256). Salt and IV are random per export.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-muted text-[10px] tracking-[0.18em] uppercase">Downloads</p>

        {/* CSV anchors stay simple — encryption only applies to the JSON backup. */}
        <ExportRow
          href="/api/export/transactions.csv"
          title="Transactions"
          subtitle="CSV · occurred_on, kind, amount, currency, account, category, note"
        />
        <ExportRow
          href="/api/export/holdings.csv"
          title="Holdings"
          subtitle="CSV · symbol, asset type, quantity, cost basis, per-row account context"
        />

        <button
          type="button"
          onClick={onExportBackup}
          disabled={exporting}
          className="border-border hover:bg-foreground/5 flex items-center justify-between gap-3 rounded border p-4 text-sm disabled:opacity-50"
        >
          <span className="min-w-0 text-left">
            <span className="block text-base">
              Full backup {encryptPass ? '(encrypted)' : ''}
            </span>
            <span className="text-muted mt-0.5 block text-[11px]">
              {encryptPass
                ? 'AES-GCM envelope · derives key in browser before download'
                : 'JSON · accounts, transactions, snapshots, goals, holdings, scenarios, settings'}
            </span>
          </span>
          <span className="text-muted text-xs">
            {exporting ? 'Working…' : 'Download ↓'}
          </span>
        </button>

        {exportError ? <p className="text-negative text-xs">{exportError}</p> : null}
        {exportNote ? <p className="text-positive text-xs">{exportNote}</p> : null}
      </section>

      <section className="border-border flex flex-col gap-3 rounded border p-4">
        <p className="text-muted text-[10px] tracking-[0.18em] uppercase">
          Import / restore (decrypt only)
        </p>
        <p className="text-muted text-xs">
          Pick an exported backup file to verify it&apos;s readable. Decryption
          runs entirely in your browser. This flow does not write to the
          database — it just confirms the file is intact and exposes a
          decrypted JSON download for hand-restore.
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-muted text-xs">Backup file (.json)</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={onFileSelected}
            className="text-muted text-xs file:mr-3 file:rounded file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-xs"
          />
        </label>

        {importFile && fileLooksEncrypted ? (
          <label className="flex flex-col gap-1">
            <span className="text-muted text-xs">Passphrase</span>
            <input
              type="password"
              autoComplete="current-password"
              value={decryptPass}
              onChange={(e) => setDecryptPass(e.target.value)}
              className="border-border focus:border-foreground rounded border bg-transparent px-3 py-2 text-sm outline-none"
            />
          </label>
        ) : null}

        {importFile && !fileLooksEncrypted && !preview && !importError ? (
          <p className="text-muted text-[11px]">
            File doesn&apos;t look encrypted — no passphrase needed.
          </p>
        ) : null}

        {importFile ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDecrypt}
              disabled={decrypting || (fileLooksEncrypted && decryptPass.length === 0)}
              className="bg-foreground text-background rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {decrypting
                ? 'Decrypting…'
                : fileLooksEncrypted
                  ? 'Decrypt'
                  : 'Open'}
            </button>
            <button
              type="button"
              onClick={resetImport}
              className="text-muted hover:text-foreground rounded px-3 py-1.5 text-xs"
            >
              Reset
            </button>
          </div>
        ) : null}

        {importError ? <p className="text-negative text-xs">{importError}</p> : null}

        {preview ? <Preview preview={preview} onDownload={onDownloadDecrypted} /> : null}
      </section>

      <p className="text-muted text-[10px] italic">
        Live market prices and the server-side price cache are intentionally
        omitted from backups — they aren&apos;t your data, and including them
        would leak internal cache state.
      </p>
    </>
  );
}

function ExportRow({
  href,
  title,
  subtitle,
}: {
  href: string;
  title: string;
  subtitle: string;
}) {
  return (
    <a
      href={href}
      download
      className="border-border hover:bg-foreground/5 flex items-center justify-between gap-3 rounded border p-4 text-sm"
    >
      <div className="min-w-0">
        <p className="text-base">{title}</p>
        <p className="text-muted mt-0.5 text-[11px]">{subtitle}</p>
      </div>
      <span className="text-muted text-xs">Download ↓</span>
    </a>
  );
}

function Preview({
  preview,
  onDownload,
}: {
  preview: DecryptedPreview;
  onDownload: () => void;
}) {
  const data = preview.payload.data ?? {};
  const counts = Object.entries(data).map(([table, rows]) => ({
    table,
    n: Array.isArray(rows) ? rows.length : 0,
  }));
  return (
    <div className="border-border flex flex-col gap-2 rounded border p-3 text-xs">
      <p className="text-positive">
        ✓ {preview.wasEncrypted ? 'Decrypted' : 'Read'} successfully.
      </p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted">schema_version</dt>
        <dd className="nums">{preview.payload.schema_version ?? '—'}</dd>
        <dt className="text-muted">exported_at</dt>
        <dd className="nums">{preview.payload.exported_at ?? '—'}</dd>
        <dt className="text-muted">user_email</dt>
        <dd className="truncate">{preview.payload.user_email ?? '—'}</dd>
      </dl>
      {counts.length > 0 ? (
        <ul className="text-muted nums flex flex-col gap-0.5 text-[11px]">
          {counts.map((c) => (
            <li key={c.table} className="flex justify-between">
              <span>{c.table}</span>
              <span>{c.n} row{c.n === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        onClick={onDownload}
        className="border-border hover:bg-foreground/5 mt-1 self-start rounded border px-3 py-1 text-[11px]"
      >
        Download decrypted JSON ↓
      </button>
    </div>
  );
}
