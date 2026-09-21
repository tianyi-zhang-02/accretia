/**
 * Line icons — one weight, one grid (24px, 1.75 stroke, round joins), drawn
 * inline so they take the text color and need no icon font, image or
 * dependency. Add an icon by adding its path data here; keep them this plain.
 */

const ICONS = {
  /** Home — work becomes optional, and housing. */
  house: ['M3 10.5 12 3l9 7.5', 'M5 9.5V20h14V9.5', 'M10 20v-6h4v6'],
  /** Money — a stack of coins. */
  coins: [
    'M5 6c0-1.66 3.13-3 7-3s7 1.34 7 3-3.13 3-7 3-7-1.34-7-3Z',
    'M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6',
    'M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6',
  ],
  /** People & careers. */
  person: ['M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', 'M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7'],
  /** The projection — rising bars. */
  chart: ['M3 20h18', 'M6 20v-6', 'M12 20V5', 'M18 20V10'],
  /** Stress tests. */
  cloud: ['M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9.6 4.2 4.2 0 0 1 17.4 18H7Z'],
  /** Goals and being on track. */
  flag: ['M5 21V4', 'M5 4h12l-2.5 4L17 12H5'],
  /** Retirement. */
  chair: [
    'M7 11V8a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3',
    'M4 13a2 2 0 0 1 4 0v2h8v-2a2 2 0 0 1 4 0v5H4v-5Z',
    'M7 18v2',
    'M17 18v2',
  ],
  /** Windfalls. */
  gem: ['M6 3h12l4 6-10 12L2 9l4-6Z', 'M2 9h20'],
  /** Time horizon. */
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M12 7v5l3 2'],
  /** Insights. */
  spark: ['M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  /** Privacy and data. */
  shield: ['M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z'],
} as const;

export type IconName = keyof typeof ICONS;

export default function Icon({
  name,
  size = 16,
  className = '',
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={`inline-block shrink-0 ${className}`}
    >
      {ICONS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** A section label with its icon — small, quiet, sentence case. */
export function SectionLabel({
  icon,
  children,
  className = '',
}: {
  icon: IconName;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`eyebrow ${className}`}>
      <Icon name={icon} size={14} />
      {children}
    </span>
  );
}
