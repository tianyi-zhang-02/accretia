/**
 * The metal card — the app's hero surface, styled after a premium metal
 * credit card: brushed finish, a light sheen that sweeps across on hover,
 * engraved figures, a chip. Dark theme: sapphire graphite. Light theme:
 * platinum. Decoration only — the content is ordinary text, so it reads,
 * copies and prints like everything else (print drops the finish).
 */
export default function MetalCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`metal ${className}`}>{children}</div>;
}

/** An EMV-style chip, drawn inline. */
export function Chip({ className = '' }: { className?: string }) {
  return (
    <svg
      width="38"
      height="28"
      viewBox="0 0 38 28"
      aria-hidden
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id="chip-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3dfa2" />
          <stop offset="0.45" stopColor="#c9a24a" />
          <stop offset="1" stopColor="#ecd28c" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="37" height="27" rx="5" fill="url(#chip-gold)" />
      <g fill="none" stroke="#8a6d2a" strokeOpacity="0.55" strokeWidth="1">
        <path d="M0.5 9.5h11m15 0h11M0.5 18.5h11m15 0h11" />
        <path d="M11.5 0.5v27m15-27v27" />
        <rect x="11.5" y="7.5" width="15" height="13" rx="2.5" />
      </g>
    </svg>
  );
}
