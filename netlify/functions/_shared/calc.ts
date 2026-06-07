// Toilet Roll Sprint — calculation engine.
//
// This is the single source of truth for every sprint figure. It is pure (no
// I/O, no Node APIs) so it can run on the server (authoritative standings) and,
// in a tiny mirrored form, in the browser for the Log Sale live preview.
//
// All money is held in pounds and rounded to 2dp for display/storage. Points
// keep full precision while aggregating and are only rounded for display, so
// bonus-ladder comparisons stay stable.

/** Default cost base per case (ex VAT). Configurable via the settings table. */
export const DEFAULT_COST_PER_CASE = 3.66;

/** Team challenge: reaching this many team points unlocks the bonus. */
export const TEAM_POINTS_TARGET = 2500;
/** Each salesperson's share of the team bonus when unlocked. */
export const TEAM_BONUS_EACH = 50;
/** Total team bonus paid out across the three salespeople when unlocked. */
export const TEAM_BONUS_TOTAL = TEAM_BONUS_EACH * 3; // £150

/** Hard cap on any individual's bonus payout. */
export const MAX_INDIVIDUAL_BONUS = 250;

/** Points multiplier bands, by margin achieved on a sale. Checked top-down. */
export const MARGIN_TIERS: { minMargin: number; multiplier: number; label: string }[] = [
  { minMargin: 46, multiplier: 1.0, label: "46% and above" },
  { minMargin: 43, multiplier: 0.9, label: "43% – 45.99%" },
  { minMargin: 40, multiplier: 0.75, label: "40% – 42.99%" },
  { minMargin: 35, multiplier: 0.5, label: "35% – 39.99%" },
  { minMargin: 0, multiplier: 0, label: "Below 35%" },
];

/** Bonus ladder: highest threshold reached is paid. Ordered high → low. */
export const BONUS_LADDER: { points: number; bonus: number }[] = [
  { points: 1000, bonus: 250 },
  { points: 750, bonus: 175 },
  { points: 500, bonus: 100 },
  { points: 300, bonus: 50 },
];

/** Round to 2 decimal places (pennies), avoiding binary float drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** The multiplier awarded for a given margin percentage. */
export function marginMultiplier(marginPct: number): number {
  for (const tier of MARGIN_TIERS) {
    if (marginPct >= tier.minMargin) return tier.multiplier;
  }
  return 0;
}

export interface SaleInput {
  cases: number;
  pricePerCase: number;
}

export interface SaleResult {
  cases: number;
  pricePerCase: number;
  salesValue: number;
  costValue: number;
  grossProfit: number;
  marginPct: number;
  multiplier: number;
  points: number;
}

/** Compute the derived figures for a single sale line. */
export function computeSale(
  { cases, pricePerCase }: SaleInput,
  costPerCase: number = DEFAULT_COST_PER_CASE,
): SaleResult {
  const salesValue = cases * pricePerCase;
  const costValue = cases * costPerCase;
  const grossProfit = salesValue - costValue;
  const marginPct = salesValue > 0 ? (grossProfit / salesValue) * 100 : 0;
  const multiplier = marginMultiplier(marginPct);
  const points = grossProfit * multiplier;
  return {
    cases,
    pricePerCase,
    salesValue: round2(salesValue),
    costValue: round2(costValue),
    grossProfit: round2(grossProfit),
    marginPct: round2(marginPct),
    multiplier,
    points: round2(points),
  };
}

/** The bonus payable for a salesperson's total points (highest band reached). */
export function bonusForPoints(points: number): number {
  for (const rung of BONUS_LADDER) {
    if (points >= rung.points) return Math.min(rung.bonus, MAX_INDIVIDUAL_BONUS);
  }
  return 0;
}

/** Points needed to reach the next bonus rung, or null once maxed out. */
export function distanceToNextBonus(points: number): number | null {
  // Ladder is high→low; walk low→high to find the first rung not yet reached.
  for (let i = BONUS_LADDER.length - 1; i >= 0; i--) {
    if (points < BONUS_LADDER[i].points) {
      return round2(BONUS_LADDER[i].points - points);
    }
  }
  return null; // already at or beyond the top rung
}

export interface Salesperson {
  id: string;
  name: string;
  role: string;
}

export interface SaleRecord {
  id?: string;
  salespersonId: string;
  saleDate?: string;
  customer?: string;
  cases: number;
  pricePerCase: number;
}

export interface StandingRow {
  salespersonId: string;
  name: string;
  role: string;
  position: number;
  totalCases: number;
  totalSalesValue: number;
  totalGrossProfit: number;
  avgMarginPct: number;
  totalPoints: number;
  currentBonus: number;
  nextThreshold: number | null;
  distanceToNext: number | null;
}

export interface PublicDashboard {
  totalCases: number;
  totalSalesValue: number;
  totalGrossProfit: number;
  topSalesperson: string | null;
}

export interface TeamChallenge {
  teamPoints: number;
  target: number;
  remaining: number;
  unlocked: boolean;
  bonusEach: number;
  bonusTotal: number;
}

export interface StandingsResult {
  table: StandingRow[];
  dashboard: PublicDashboard;
  team: TeamChallenge;
}

interface Aggregate {
  cases: number;
  salesValue: number;
  grossProfit: number;
  points: number;
}

function aggregate(
  sales: SaleRecord[],
  costPerCase: number,
): Map<string, Aggregate> {
  const map = new Map<string, Aggregate>();
  for (const s of sales) {
    const r = computeSale({ cases: s.cases, pricePerCase: s.pricePerCase }, costPerCase);
    const cur = map.get(s.salespersonId) ?? {
      cases: 0,
      salesValue: 0,
      grossProfit: 0,
      points: 0,
    };
    cur.cases += r.cases;
    cur.salesValue += r.salesValue;
    cur.grossProfit += r.grossProfit;
    cur.points += r.points;
    map.set(s.salespersonId, cur);
  }
  return map;
}

// Value-weighted average margin = Σ(margin × value) ÷ Σ value, which algebraically
// reduces to total GP ÷ total sales value × 100 (fairer across deals of different
// sizes — the decision recorded in the brief).
function weightedMargin(grossProfit: number, salesValue: number): number {
  return salesValue > 0 ? round2((grossProfit / salesValue) * 100) : 0;
}

/**
 * Build the full league standings, public dashboard strip and team challenge
 * from the raw sale records. Ranking tie-breakers, in order: total points,
 * gross profit, average margin, cases sold (all highest-first).
 */
export function buildStandings(
  salespeople: Salesperson[],
  sales: SaleRecord[],
  costPerCase: number = DEFAULT_COST_PER_CASE,
): StandingsResult {
  const agg = aggregate(sales, costPerCase);

  const rows: StandingRow[] = salespeople.map((p) => {
    const a = agg.get(p.id) ?? { cases: 0, salesValue: 0, grossProfit: 0, points: 0 };
    const totalPoints = round2(a.points);
    const distance = distanceToNextBonus(totalPoints);
    const next = nextThresholdFor(totalPoints);
    return {
      salespersonId: p.id,
      name: p.name,
      role: p.role,
      position: 0,
      totalCases: a.cases,
      totalSalesValue: round2(a.salesValue),
      totalGrossProfit: round2(a.grossProfit),
      avgMarginPct: weightedMargin(a.grossProfit, a.salesValue),
      totalPoints,
      currentBonus: bonusForPoints(totalPoints),
      nextThreshold: next,
      distanceToNext: distance,
    };
  });

  rows.sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      b.totalGrossProfit - a.totalGrossProfit ||
      b.avgMarginPct - a.avgMarginPct ||
      b.totalCases - a.totalCases,
  );
  rows.forEach((r, i) => (r.position = i + 1));

  const totalCases = rows.reduce((n, r) => n + r.totalCases, 0);
  const totalSalesValue = round2(rows.reduce((n, r) => n + r.totalSalesValue, 0));
  const totalGrossProfit = round2(rows.reduce((n, r) => n + r.totalGrossProfit, 0));
  const teamPoints = round2(rows.reduce((n, r) => n + r.totalPoints, 0));
  const topSalesperson = rows.length && totalCases > 0 ? rows[0].name : null;

  return {
    table: rows,
    dashboard: { totalCases, totalSalesValue, totalGrossProfit, topSalesperson },
    team: {
      teamPoints,
      target: TEAM_POINTS_TARGET,
      remaining: Math.max(0, round2(TEAM_POINTS_TARGET - teamPoints)),
      unlocked: teamPoints >= TEAM_POINTS_TARGET,
      bonusEach: TEAM_BONUS_EACH,
      bonusTotal: TEAM_BONUS_TOTAL,
    },
  };
}

function nextThresholdFor(points: number): number | null {
  for (let i = BONUS_LADDER.length - 1; i >= 0; i--) {
    if (points < BONUS_LADDER[i].points) return BONUS_LADDER[i].points;
  }
  return null;
}

export interface DirectorPersonBreakdown {
  salespersonId: string;
  name: string;
  role: string;
  totalPoints: number;
  individualBonus: number;
  teamBonusShare: number;
  totalBonus: number;
}

export interface DirectorFigures {
  totalCases: number;
  totalSalesValue: number;
  totalGrossProfit: number;
  totalPoints: number;
  avgMarginPct: number;
  individualBonusLiability: number;
  teamBonusLiability: number;
  totalBonusLiability: number;
  netProfitAfterBonuses: number;
  selfFunding: {
    keptInBusiness: number;
    isSelfFunding: boolean;
    message: string;
  };
  perPerson: DirectorPersonBreakdown[];
  team: TeamChallenge;
}

/**
 * Director-only business figures. Derived from the same standings so the public
 * and director views can never disagree. Computed server-side and only returned
 * to an authenticated director.
 */
export function buildDirectorFigures(
  salespeople: Salesperson[],
  sales: SaleRecord[],
  costPerCase: number = DEFAULT_COST_PER_CASE,
): DirectorFigures {
  const standings = buildStandings(salespeople, sales, costPerCase);
  const unlocked = standings.team.unlocked;

  const perPerson: DirectorPersonBreakdown[] = standings.table.map((r) => {
    const individualBonus = r.currentBonus;
    const teamBonusShare = unlocked ? TEAM_BONUS_EACH : 0;
    return {
      salespersonId: r.salespersonId,
      name: r.name,
      role: r.role,
      totalPoints: r.totalPoints,
      individualBonus,
      teamBonusShare,
      totalBonus: individualBonus + teamBonusShare,
    };
  });

  const individualBonusLiability = round2(
    perPerson.reduce((n, p) => n + p.individualBonus, 0),
  );
  const teamBonusLiability = unlocked ? TEAM_BONUS_TOTAL : 0;
  const totalBonusLiability = round2(individualBonusLiability + teamBonusLiability);

  const totalGrossProfit = standings.dashboard.totalGrossProfit;
  const netProfitAfterBonuses = round2(totalGrossProfit - totalBonusLiability);
  const keptInBusiness = netProfitAfterBonuses;
  const isSelfFunding = totalBonusLiability <= totalGrossProfit;

  const message = isSelfFunding
    ? `Bonuses of £${totalBonusLiability.toFixed(2)} are fully covered by £${totalGrossProfit.toFixed(
        2,
      )} of gross profit, leaving £${keptInBusiness.toFixed(2)} in the business.`
    : `Warning: bonuses of £${totalBonusLiability.toFixed(2)} exceed gross profit of £${totalGrossProfit.toFixed(
        2,
      )} by £${Math.abs(keptInBusiness).toFixed(2)}. The promotion is not self-funding at this point.`;

  return {
    totalCases: standings.dashboard.totalCases,
    totalSalesValue: standings.dashboard.totalSalesValue,
    totalGrossProfit,
    totalPoints: standings.team.teamPoints,
    avgMarginPct: weightedMargin(totalGrossProfit, standings.dashboard.totalSalesValue),
    individualBonusLiability,
    teamBonusLiability,
    totalBonusLiability,
    netProfitAfterBonuses,
    selfFunding: { keptInBusiness, isSelfFunding, message },
    perPerson,
    team: standings.team,
  };
}
