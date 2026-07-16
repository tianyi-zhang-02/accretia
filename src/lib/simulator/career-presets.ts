import type { CareerStage } from '@/lib/validation/scenarios';

/**
 * Career presets — illustrative starting points the user is expected to
 * tune. Numbers are rough USD figures for the US labor market, last
 * reviewed during the initial Step 10 build (2026).
 *
 * These are NOT authoritative salary data. They exist so a fresh scenario
 * has reasonable defaults to anchor on while the user fills in their own
 * actual figures. Always remind the user in the UI to override.
 *
 * The `stages` arrays are ordered by `startAge` ascending; the simulation
 * engine picks the latest stage whose `startAge ≤ current age`.
 */

export type CareerPreset = {
  id: string;
  label: string;
  stages: CareerStage[];
};

export const CAREER_PRESETS: readonly CareerPreset[] = [
  {
    id: 'biglaw',
    label: 'BigLaw associate → partner',
    stages: [
      {
        label: 'BigLaw Associate',
        startAge: 27,
        baseSalary: 225_000,
        annualRaisePct: 12,
        bonusPct: 25,
      },
      {
        // Partner draws are eat-what-you-kill: the expected path grows
        // modestly, but any single year can swing widely — volatilityPct
        // feeds the Monte Carlo bands.
        label: 'BigLaw Partner',
        startAge: 36,
        baseSalary: 1_100_000,
        annualRaisePct: 3,
        bonusPct: 0,
        volatilityPct: 30,
      },
    ],
  },
  {
    id: 'inhouse',
    label: 'In-house counsel',
    stages: [
      {
        label: 'In-house Counsel',
        startAge: 30,
        baseSalary: 220_000,
        annualRaisePct: 4,
        bonusPct: 15,
      },
    ],
  },
  {
    id: 'gov',
    label: 'Government / public-interest attorney',
    stages: [
      {
        label: 'Public-interest attorney',
        startAge: 27,
        baseSalary: 75_000,
        annualRaisePct: 3,
        bonusPct: 0,
      },
    ],
  },
  {
    id: 'swe',
    label: 'Software engineer (IC track)',
    stages: [
      {
        label: 'SWE',
        startAge: 22,
        baseSalary: 160_000,
        annualRaisePct: 5,
        bonusPct: 15,
        annualEquity: 60_000,
      },
      {
        label: 'Senior SWE',
        startAge: 28,
        baseSalary: 240_000,
        annualRaisePct: 4,
        bonusPct: 25,
        annualEquity: 180_000,
      },
      {
        label: 'Staff SWE',
        startAge: 33,
        baseSalary: 320_000,
        annualRaisePct: 4,
        bonusPct: 30,
        annualEquity: 350_000,
      },
    ],
  },
  {
    id: 'em',
    label: 'Engineering management',
    stages: [
      {
        label: 'SWE',
        startAge: 22,
        baseSalary: 160_000,
        annualRaisePct: 5,
        bonusPct: 15,
        annualEquity: 60_000,
      },
      {
        label: 'Engineering Manager',
        startAge: 30,
        baseSalary: 260_000,
        annualRaisePct: 5,
        bonusPct: 25,
        annualEquity: 200_000,
      },
      {
        label: 'Senior Manager / Director',
        startAge: 36,
        baseSalary: 340_000,
        annualRaisePct: 4,
        bonusPct: 30,
        annualEquity: 400_000,
      },
    ],
  },
  {
    id: 'medicine',
    label: 'Medicine (resident → attending)',
    stages: [
      { label: 'Resident', startAge: 26, baseSalary: 65_000, annualRaisePct: 3, bonusPct: 0 },
      { label: 'Fellow', startAge: 30, baseSalary: 80_000, annualRaisePct: 3, bonusPct: 0 },
      { label: 'Attending', startAge: 33, baseSalary: 280_000, annualRaisePct: 3, bonusPct: 10 },
    ],
  },
  {
    id: 'finance',
    label: 'Finance / IB',
    stages: [
      { label: 'Analyst', startAge: 22, baseSalary: 110_000, annualRaisePct: 0, bonusPct: 80 },
      { label: 'Associate', startAge: 25, baseSalary: 200_000, annualRaisePct: 0, bonusPct: 100 },
      { label: 'VP', startAge: 30, baseSalary: 275_000, annualRaisePct: 5, bonusPct: 150 },
      { label: 'Director', startAge: 35, baseSalary: 375_000, annualRaisePct: 5, bonusPct: 200 },
    ],
  },
  {
    id: 'custom',
    label: 'Custom (start blank)',
    stages: [],
  },
] as const;

export function findPreset(id: string): CareerPreset | undefined {
  return CAREER_PRESETS.find((p) => p.id === id);
}
