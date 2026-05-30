import { redirect } from 'next/navigation';

import BottomNav from '@/components/layout/bottom-nav';
import { ToastProvider } from '@/components/ui/toast';
import { getAuthedUser } from '@/lib/supabase/server';

/**
 * Layout for all authenticated app pages. The proxy redirects unauth users
 * before they reach this layout, but the explicit check is defense in depth.
 *
 * Pages inside this group get the bottom nav, a bottom padding to clear
 * it, and the toast provider so every mutation surface can `useToast()`.
 * Pages outside (e.g. /login) render without any of that.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthedUser();
  if (!user) redirect('/login');

  return (
    <ToastProvider>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col pb-28">
        {children}
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
