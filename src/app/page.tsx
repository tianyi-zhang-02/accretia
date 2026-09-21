import { connection } from 'next/server';

import SimulatorClient from './simulator-client';

/**
 * The entire app: a purely client-side wealth-projection simulator.
 *
 * `await connection()` opts this page into dynamic rendering so the
 * per-request CSP nonce set in `src/proxy.ts` is applied to the scripts
 * Next.js emits. The render itself does no data fetching — there is no
 * backend, database, or auth anywhere in this project.
 */
export default async function HomePage() {
  await connection();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 has-tabbar px-4 pt-6 pb-16 sm:pt-8">
      <SimulatorClient />
    </main>
  );
}
