import { redirect } from 'next/navigation';

import { getAuthedUser } from '@/lib/supabase/server';

import ExportClient from './export-client';

/**
 * /settings/export — encryption + import live entirely in the client
 * component (Web Crypto). This server component just guards the auth.
 */
export default async function ExportPage() {
  const user = await getAuthedUser();
  if (!user) redirect('/login');

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 pt-10">
      <ExportClient />
    </main>
  );
}
