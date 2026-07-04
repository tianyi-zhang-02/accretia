'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChartLine, GitCompareArrows, House, Settings, type LucideIcon } from 'lucide-react';

import PlusMenu from './plus-menu';

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  /**
   * When false, this tab is never rendered in the active/highlighted state.
   * Used for the Compare shortcut, which links into a *view* of the home
   * page (`/?view=compare`) rather than a distinct pathname — `usePathname`
   * can't see the query string, so we opt it out of highlighting rather
   * than have it always light up alongside Projection on `/`.
   */
  highlight?: boolean;
};

// Projection-first navigation. The wealth simulator is the home screen;
// the manual tracking features (accounts, portfolio, transactions,
// snapshots, goals) still exist but live under Settings now that a real
// brokerage handles day-to-day tracking.
const LEFT: readonly NavItem[] = [
  { href: '/', label: 'Projection', Icon: ChartLine },
  { href: '/dashboard', label: 'Dashboard', Icon: House },
];

const RIGHT: readonly NavItem[] = [
  { href: '/?view=compare', label: 'Compare', Icon: GitCompareArrows, highlight: false },
  { href: '/settings', label: 'Settings', Icon: Settings },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.highlight === false) return false;
  if (item.href === '/') return pathname === '/';
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/70 fixed inset-x-0 bottom-0 z-40 border-t pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-2">
        {LEFT.map((item) => (
          <NavTab key={item.href} item={item} active={isActive(pathname, item)} />
        ))}

        {/* Raised center "+" opens a sheet whose primary action is a new
            projection scenario; tracking shortcuts sit below — see plus-menu.tsx. */}
        <li className="relative flex justify-center">
          <PlusMenu />
        </li>

        {RIGHT.map((item) => (
          <NavTab key={item.href} item={item} active={isActive(pathname, item)} />
        ))}
      </ul>
    </nav>
  );
}

function NavTab({ item, active }: { item: NavItem; active: boolean }) {
  const { Icon } = item;
  return (
    <li className="flex">
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] tracking-wide uppercase transition-colors ${
          active ? 'text-accent' : 'text-muted hover:text-foreground'
        }`}
      >
        <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    </li>
  );
}
