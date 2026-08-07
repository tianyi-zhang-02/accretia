/**
 * Pixel icons — the signature language of the UI, drawn as 8×8 grids.
 *
 * Deliberately NOT canvas: these are SVG `<rect>`s with `shapeRendering:
 * crispEdges`, so they render server-side, scale to any size without
 * blurring, and take their colors from the theme (`currentColor` for the
 * solid pixels, `--accent` for the highlight). Zero images, zero deps —
 * same rule as the pixel journey.
 *
 * Grids are literal art: `#` = foreground, `+` = accent, `.` = empty. Edit
 * them by looking at them.
 */

const ICONS = {
  /** FIRE / work becomes optional — a house with an accent roof. */
  house: [
    '...++...',
    '..++++..',
    '.++++++.',
    '++++++++',
    '.######.',
    '.##..##.',
    '.##..##.',
    '........',
  ],
  /** Money on hand — stacked coins. */
  coins: [
    '........',
    '.++++++.',
    '.+....+.',
    '.++++++.',
    '.######.',
    '.#....#.',
    '.######.',
    '........',
  ],
  /** People & careers. */
  person: [
    '..++++..',
    '..++++..',
    '........',
    '.######.',
    '########',
    '.######.',
    '..##.##.',
    '..#...#.',
  ],
  /** The projection itself — a rising bar chart. */
  chart: [
    '........',
    '......++',
    '......++',
    '...##.++',
    '...##.++',
    '##.##.++',
    '##.##.++',
    '........',
  ],
  /** Stress tests — a raining cloud. */
  cloud: [
    '........',
    '..####..',
    '.######.',
    '########',
    '########',
    '........',
    '.+..+..+',
    '..+..+..',
  ],
  /** A goal to hit — a planted flag. */
  flag: [
    '.#++++..',
    '.#++++..',
    '.#+++...',
    '.#......',
    '.#......',
    '.#......',
    '.#......',
    '..####..',
  ],
  /** Retirement — the deck chair from the journey. */
  chair: [
    '........',
    '.....++.',
    '....++..',
    '...++...',
    '..++++++',
    '.#....#.',
    '.#....#.',
    '........',
  ],
  /** Insights — a cut gem, because these are the valuable bits. */
  gem: [
    '........',
    '..++++..',
    '.++++++.',
    '########',
    '.######.',
    '..####..',
    '...##...',
    '........',
  ],
  /** Time horizon. */
  clock: [
    '..####..',
    '.#....#.',
    '#..+...#',
    '#..+...#',
    '#..+++.#',
    '#......#',
    '.#....#.',
    '..####..',
  ],
  /** The guide / agent. */
  spark: [
    '...++...',
    '...++...',
    '#..++..#',
    '.++++++.',
    '.++++++.',
    '#..++..#',
    '...++...',
    '...++...',
  ],
  /** The guide's pointer — "this bit, right here". */
  arrow: [
    '........',
    '..#.....',
    '..##....',
    '..+++++.',
    '..+++++.',
    '..##....',
    '..#.....',
    '........',
  ],
  /** Privacy — nothing leaves the device. */
  shield: [
    '.######.',
    '#++++++#',
    '#++++++#',
    '#++++++#',
    '#++++++#',
    '.#++++#.',
    '..#++#..',
    '...##...',
  ],
} as const;

export type PixelIconName = keyof typeof ICONS;

export default function PixelIcon({
  name,
  size = 16,
  className = '',
}: {
  name: PixelIconName;
  size?: number;
  className?: string;
}) {
  const grid = ICONS[name];
  const solid: string[] = [];
  const accent: string[] = [];
  grid.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === '#') solid.push(`${x},${y}`);
      else if (cell === '+') accent.push(`${x},${y}`);
    });
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      aria-hidden
      focusable="false"
      shapeRendering="crispEdges"
      className={`inline-block shrink-0 ${className}`}
    >
      <g fill="currentColor">
        {solid.map((p) => {
          const [x, y] = p.split(',');
          return <rect key={`s${p}`} x={x} y={y} width="1" height="1" />;
        })}
      </g>
      <g fill="var(--accent)">
        {accent.map((p) => {
          const [x, y] = p.split(',');
          return <rect key={`a${p}`} x={x} y={y} width="1" height="1" />;
        })}
      </g>
    </svg>
  );
}

/**
 * A section label with its icon — the repeated unit that makes the whole
 * page feel like one system instead of a stack of boxes.
 */
export function PixelLabel({
  icon,
  children,
  className = '',
}: {
  icon: PixelIconName;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`text-muted flex items-center gap-2 text-[11px] tracking-[0.18em] uppercase ${className}`}
    >
      <PixelIcon name={icon} size={12} />
      {children}
    </span>
  );
}
