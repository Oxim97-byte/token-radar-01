// Token Radar, model radar-2-comps.
//
// The board ranks pre-token protocols by an implied value that is priced off the
// market, not off a flat multiple: for each category, the live-token protocols
// that already trade give a market-cap-to-TVL multiple, and a pre-token
// protocol's TVL is priced at its own category's multiple. Thin categories are
// shrunk toward the global multiple, so no category's price rests on one or two
// names. Growth, age and chain breadth then adjust that priced base. No
// protocol name is ever special-cased: the same function scores every row.
//
//   comps(category) = min(3, w * median(mcap/tvl of live protocols in the category)
//                     + (1 - w) * median(mcap/tvl of all live protocols))
//                     w = n / (n + SHRINK_K), n = live protocols in the category
// The 3x cap is the guard against a degenerate comp: one live protocol in a
// thin category can carry a market cap hundreds of times its TVL (a token
// whose value has nothing to do with the TVL on record), and without the cap
// that single ratio would price the whole category.
//
// Every row also carries what its price is made of, so a reader can audit it:
// the five nearest live peers that price its category (same category first,
// nearest by TVL), the dollar value at each step of the waterfall (base, after
// growth, after maturity, implied), and a confidence score from the depth of
// its comparables, how tightly their multiples agree, and whether its growth
// and age are on record. Nothing about a protocol is asserted that its own
// snapshot figures do not show.
//   base            = tvl_usd * comps(category)
//   growthMult      = 1 + clamp(change_7d, -60, 120) / 100 * GROWTH_WEIGHT
//   maturityMult    = 0.6 + min(age_days, 1095) / 1095 * 0.4   (unknown age: 365)
//   chainMult       = 1 + min(chains - 1, 4) * 0.03
//   implied         = max(1, round(base * growthMult * maturityMult * chainMult))
//
// The multiples use circulating market cap, not fully diluted value, so the
// board is conservative by construction: a launch is usually priced on FDV,
// which is at least the circulating value. The dashboard states this.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may move them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max_steps: number;
  shrink_k: number;
  multiple_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.03,
  chain_max_steps: 4,
  shrink_k: 5,
  multiple_cap: 3,
};

/** The model's version label: the dashboard names it and the method section quotes it. */
export const MODEL_VERSION = 'radar-3-auditable';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One of the live-token peers that prices a protocol's category. */
export interface Peer {
  slug: string;
  name: string;
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    comp_multiple: number;
    comp_count: number;
    comp_category_median: number | null;
    comp_global_median: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
    base_value_usd: number;
    after_growth_usd: number;
    after_maturity_usd: number;
    confidence: number;
    confidence_depth: number;
    confidence_dispersion: number;
    confidence_completeness: number;
    peers: Peer[];
  };
  risk_note: string;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  comp_multiple: number;
  comp_count: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  confidence: number;
  confidence_depth: number;
  confidence_dispersion: number;
  confidence_completeness: number;
  base_value_usd: number;
  after_growth_usd: number;
  after_maturity_usd: number;
  peers: Peer[];
  risk_note: string;
}

/** One category's comparables, for the method section's multiples table. */
export interface CompRow {
  category: string;
  count: number;
  category_median: number | null;
  multiple: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the comparables and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  global_median: number;
  watchlist: string[];
  comps: CompRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted-or-not list of numbers; null when the list is empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The comparables for every category: live protocols' market-cap-to-TVL medians. */
export interface Comparables {
  global: number;
  byCategory: Map<string, { count: number; median: number | null; multiple: number }>;
}

/** Build the comparables from the snapshot's live-token protocols. */
export function buildComparables(snapshot: Snapshot, model: ModelConstants = MODEL): Comparables {
  const live = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0,
  );
  const global = median(live.map((p) => p.mcap_usd! / p.tvl_usd)) ?? 0;
  const byCategory = new Map<string, { count: number; median: number | null; multiple: number }>();
  const cats = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = cats.get(key);
    if (list) list.push(p.mcap_usd! / p.tvl_usd);
    else cats.set(key, [p.mcap_usd! / p.tvl_usd]);
  }
  for (const [key, list] of [...cats.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const med = median(list);
    const w = list.length / (list.length + model.shrink_k);
    const blended = med === null ? global : w * med + (1 - w) * global;
    const multiple = Math.min(blended, model.multiple_cap);
    byCategory.set(key, { count: list.length, median: med, multiple });
  }
  return { global, byCategory };
}

/** The comparables table the dashboard's method section renders, best-covered first. */
export function compRows(comps: Comparables): CompRow[] {
  return [...comps.byCategory.entries()]
    .map(([category, v]) => ({
      category,
      count: v.count,
      category_median: v.median,
      multiple: v.multiple,
    }))
    .sort((a, b) => b.count - a.count || (a.category < b.category ? -1 : 1));
}

/** The priced multiple one protocol gets: its category's shrunk multiple, else the global one. */
export function multipleFor(p: SnapshotProtocol, comps: Comparables): { multiple: number; count: number; categoryMedian: number | null } {
  const entry = comps.byCategory.get(p.category ?? 'Other');
  if (entry === undefined) return { multiple: comps.global, count: 0, categoryMedian: null };
  return { multiple: entry.multiple, count: entry.count, categoryMedian: entry.median };
}

/** The four multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  comps: Comparables,
  model: ModelConstants,
): {
  implied: number;
  multiple: number;
  compCount: number;
  categoryMedian: number | null;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  age: number | null;
  base: number;
  afterGrowth: number;
  afterMaturity: number;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const priced = multipleFor(protocol, comps);
  // The multiple is quoted to four decimals before anything is priced from
  // it, and the waterfall rounds to whole dollars at each step, so the page
  // recomputes the board's number exactly from the figures the row carries.
  const multiple = round4(priced.multiple);
  const count = priced.count;
  const categoryMedian = priced.categoryMedian;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.max(0, Math.min(protocol.chains.length - 1, model.chain_max_steps));
  const chainMult = 1 + extraChains * model.chain_step;
  const base = Math.round(protocol.tvl_usd * multiple);
  const afterGrowth = Math.round(base * growthMult);
  const afterMaturity = Math.round(afterGrowth * maturityMult);
  const implied = Math.max(1, Math.round(afterMaturity * chainMult));
  return { implied, multiple, compCount: count, categoryMedian, growthPct, growthMult, maturityMult, chainMult, age, base, afterGrowth, afterMaturity };
}

/** How far apart two TVLs are, in log points: the peer distance. */
function tvlDistance(a: number, b: number): number {
  return Math.abs(Math.log(Math.max(1, a)) - Math.log(Math.max(1, b)));
}

/**
 * The five live-token peers that price a protocol: same category first,
 * nearest by TVL, then the nearest live protocols of any category to fill.
 * Every peer is a protocol that already trades, with its own multiple shown.
 */
export function peerSet(protocol: SnapshotProtocol, snapshot: Snapshot): Peer[] {
  const live = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0 && p.category !== 'CEX',
  );
  const byDistance = (a: SnapshotProtocol, b: SnapshotProtocol): number =>
    tvlDistance(a.tvl_usd, protocol.tvl_usd) - tvlDistance(b.tvl_usd, protocol.tvl_usd) ||
    (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  const same = live.filter((p) => (p.category ?? 'Other') === (protocol.category ?? 'Other')).sort(byDistance);
  const rest = live.filter((p) => (p.category ?? 'Other') !== (protocol.category ?? 'Other')).sort(byDistance);
  const picked = [...same, ...rest].slice(0, 5);
  return picked.map((p) => ({
    slug: p.slug,
    name: p.name,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd!,
    multiple: Math.round((p.mcap_usd! / p.tvl_usd) * 1e4) / 1e4,
  }));
}

/** The first quartile, median and third quartile of a list, or nulls when too thin. */
function quartiles(values: number[]): { q1: number; q3: number } | null {
  if (values.length < 2) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number): number => {
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
  };
  return { q1: at(0.25), q3: at(0.75) };
}

/**
 * Confidence 0..100 that a row's price means something: how many live comps
 * price its category (40 points, full at 10), how tightly those comps' own
 * multiples agree (30 points; a wide spread means the category has no single
 * price), and whether the protocol's growth and age are on record at all
 * (15 points each). A thin category or a missing figure costs points openly.
 */
export function confidenceFor(
  protocol: SnapshotProtocol,
  comps: Comparables,
  snapshot: Snapshot,
): { confidence: number; depth: number; dispersion: number; completeness: number } {
  const entry = comps.byCategory.get(protocol.category ?? 'Other');
  const n = entry === undefined ? 0 : entry.count;
  const depth = Math.round((Math.min(1, n / 10) * 40) * 10) / 10;
  let dispersion: number;
  const multiples = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0 && (p.category ?? 'Other') === (protocol.category ?? 'Other'))
    .map((p) => p.mcap_usd! / p.tvl_usd);
  const q = quartiles(multiples);
  if (q === null) {
    dispersion = 15;
  } else {
    const med = median(multiples) ?? 0;
    const spread = med > 0 ? (q.q3 - q.q1) / med : 1;
    dispersion = Math.round(Math.max(0, Math.min(1, 1 - spread / 1.5)) * 30 * 10) / 10;
  }
  const completeness = (protocol.change_7d !== null ? 15 : 0) + (protocol.listed_at !== null ? 15 : 0);
  const confidence = Math.max(0, Math.min(100, Math.round(depth + dispersion + completeness)));
  return { confidence, depth, dispersion, completeness };
}

/**
 * The risk note: what the protocol's own figures warn about, in one line.
 * A falling TVL, a single chain, a short record and thin comps each cost the
 * farmer something; the note names the ones that apply, worst first.
 */
export function riskNote(
  protocol: SnapshotProtocol,
  v: { growthPct: number; age: number | null },
  compCount: number,
): string {
  const flags: string[] = [];
  if (protocol.change_7d !== null && protocol.change_7d < -10) {
    flags.push(`TVL fell ${Math.abs(protocol.change_7d).toFixed(1)}% in 7 days, so the position is shrinking`);
  }
  if (protocol.chains.length <= 1) {
    flags.push(`single-chain: all of its TVL sits on ${chainOf(protocol)}`);
  }
  if (v.age !== null && v.age < 90) {
    flags.push(`listed ${v.age} days ago, a short record to trust`);
  }
  if (compCount < 3) {
    flags.push(`only ${compCount} live comp${compCount === 1 ? '' : 's'} price this category, so the multiple is thin`);
  }
  if (flags.length === 0) return 'No single red flag in the snapshot figures; the usual farm risks still apply.';
  return `Watch: ${flags.slice(0, 2).join('; ')}.`;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped, staked or staking in a name: a wrapped or staked product, not a launch. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
/** An exchange's name at the start of a protocol name: the exchange's own product. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token and not a wrapped,
 * staked or bridged product of a token that already trades, by the same rule
 * the snapshot's watchlist uses. A name or category that fails the rule is a
 * product of a launch that already happened, never a launch still to come.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = buildComparables(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, at any TVL. The floor is
  // never the whole board: the radar exists to find launches below it too.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, comps, model);
    const peers = peerSet(p, snapshot);
    const conf = confidenceFor(p, comps, snapshot);
    const risk = riskNote(p, v, v.compCount);
    return { p, v, peers, conf, risk };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      comp_multiple: round4(s.v.multiple),
      comp_count: s.v.compCount,
      comp_category_median: s.v.categoryMedian === null ? null : round4(s.v.categoryMedian),
      comp_global_median: round4(comps.global),
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      chain_multiplier: round4(s.v.chainMult),
      age_days: s.v.age,
      base_value_usd: s.v.base,
      after_growth_usd: s.v.afterGrowth,
      after_maturity_usd: s.v.afterMaturity,
      confidence: s.conf.confidence,
      confidence_depth: s.conf.depth,
      confidence_dispersion: s.conf.dispersion,
      confidence_completeness: s.conf.completeness,
      peers: s.peers,
    },
    risk_note: s.risk,
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('yield') || c.includes('yield aggregator')) return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and keep the shares.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('gaming') || c.includes('nft')) return `Use $${capital} to play or mint through ${name} on ${chain} and keep the assets.`;
  if (c.includes('ai') || c.includes('services')) return `Spend $${capital} on ${name}'s service on ${chain} and keep the receipt.`;
  if (c.includes('payments') || c.includes('paymaster')) return `Route $${capital} of payments through ${name} on ${chain} and keep the receipts.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second qualifying action, so the plan is not one deposit and done. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $${Math.max(20, Math.round(capital / 3))} against the supply on ${name}, then repay it the same week.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Swap $${Math.max(20, Math.round(capital / 5))} through ${name}'s main pool on ${chain} and add the proceeds back.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Close the hedge on ${name} and open a fresh one half its size.`;
  if (c.includes('bridge')) return `Bridge $${Math.max(20, Math.round(capital / 5))} back through ${name} so both directions are on record.`;
  if (c.includes('rwa') || c.includes('stable')) return `Top up the position by $${Math.max(20, Math.round(capital / 5))} on ${name} so the balance grows.`;
  if (c.includes('prediction')) return `Settle the first market position on ${name} and place a second one.`;
  return `Do one more on-chain action on ${name}, such as a swap, a vote or a deposit, so the wallet is not a single deposit.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: `about $${gas} of gas`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, then unwind in stages and keep enough gas to exit.`,
      cost: 'nothing but the log',
      time: '5 minutes to log, a week to unwind',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    comp_multiple: row.model.comp_multiple,
    comp_count: row.model.comp_count,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    confidence: row.model.confidence,
    confidence_depth: row.model.confidence_depth,
    confidence_dispersion: row.model.confidence_dispersion,
    confidence_completeness: row.model.confidence_completeness,
    base_value_usd: row.model.base_value_usd,
    after_growth_usd: row.model.after_growth_usd,
    after_maturity_usd: row.model.after_maturity_usd,
    peers: row.model.peers,
    risk_note: row.risk_note,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = buildComparables(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: board.reduce((sum, r) => sum + r.implied_value_usd, 0),
    global_median: round4(comps.global),
    watchlist: [...snapshot.watchlist].sort(),
    comps: compRows(comps),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, fewer than the gate's 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
