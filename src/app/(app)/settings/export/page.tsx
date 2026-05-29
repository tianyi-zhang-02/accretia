import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthedUser } from '@/lib/supabase/server';

/**
 * /settings/export — three download buttons (transactions CSV, holdings
 * CSV, full JSON backup). Each is an anchor pointing at the matching
 * server route; the route sets Content-Disposition so the browser
 * downloads rather than navigates.
 */
export default async function ExportPage() {
  const user = await getAuthedUser();
  if (!user) redirect('/login');

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 pt-10">
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

      <section className="flex flex-col gap-3">
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
        <ExportRow
          href="/api/export/backup.json"
          title="Full backup"
          subtitle="JSON · accounts, transactions, snapshots, goals, holdings, scenarios, settings"
        />
      </section>

      <p className="text-muted text-[10px] italic">
        Live market prices and the server-side price cache are intentionally
        omitted — they aren&apos;t your data, and including them would leak
        internal cache state.
      </p>
    </main>
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
