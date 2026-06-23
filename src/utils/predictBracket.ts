// Builds the full prediction for the "Predict" page (you vs. the model):
// the group stage (who finishes where) AND the knockout bracket that flows from
// it. Everything is anchored to today's real results — current standings seed
// the default group order and any decided game (a complete group, a finished
// knockout tie) is locked. Probabilities reuse the app's own forecast model
// (src/sim/engine.ts); no numbers are invented.
import type { Match, Stage, Standings, Team, Venue } from '../types'
import { assignThirds, pairProbs, type SimModel } from '../sim/engine'

export interface PredMatch {
  /** official match number — stable id for the user's pick + the venue */
  n: number
  stage: Stage // 'r32' | 'r16' | 'qf' | 'sf' | 'final'
  /** host country of the fixed venue, for the model's home-advantage bonus */
  venueCountry?: string
  // Round-of-32 ties carry the two qualifier seeds (resolved from the group
  // predictions); later rounds carry the feeding match numbers.
  seedHome?: string
  seedAway?: string
  feedHome?: number
  feedAway?: number
}

export interface PredBracket {
  /** rounds in play order: [r32 ×16, r16 ×8, qf ×4, sf ×2, final ×1] */
  rounds: PredMatch[][]
  finalN: number
}

/** one group's current state, used to render and predict the group stage */
export interface GroupView {
  group: string
  /** team codes in current standings order (rank 1 → 4) */
  order: string[]
  pts: Record<string, number>
  played: Record<string, number>
  /** today's top two (the default qualifiers) in standings order */
  defaultTop2: [string, string]
  /** the group is mathematically decided — its order is locked to reality */
  complete: boolean
}

/** the user's chosen [winner, runner-up] per group; absent = use today's top two */
export type GroupSelections = Record<string, string[]>

/** short display names for the few teams whose full name overruns a bracket slot */
export const SHORT_NAME: Record<string, string> = {
  BIH: 'Bosnia',
}

/**
 * Probability the home team advances past the away team in a single knockout
 * tie, splitting the regulation-draw mass by the same rating share the engine
 * uses for extra time / penalties. Returns 0..1; the away side is 1 − this.
 */
export function koWinProb(
  model: SimModel,
  home: string,
  away: string,
  venueCountry: string | undefined,
): number {
  const { h, d, dr } = pairProbs(model, home, away, venueCountry)
  const share = 1 / (1 + 10 ** (-dr / 400))
  return h + d * share
}

/** current per-group standings, newest data first; falls back to model rating */
export function groupViews(
  matches: Match[],
  teams: Record<string, Team>,
  standings: Standings,
  model: SimModel,
): GroupView[] {
  const ratingOf = (c: string) => model.teams[c]?.r ?? 1500
  const groups: Record<string, string[]> = {}
  for (const tm of Object.values(teams)) {
    groups[tm.group] ??= []
    groups[tm.group].push(tm.code)
  }
  // count of played group matches per team, to surface "today's" progress
  const played: Record<string, number> = {}
  for (const m of matches) {
    if (m.stage !== 'group' || m.status !== 'finished' || !m.home || !m.away) continue
    played[m.home.code] = (played[m.home.code] ?? 0) + 1
    played[m.away.code] = (played[m.away.code] ?? 0) + 1
  }

  const views: GroupView[] = []
  for (const g of Object.keys(groups).sort()) {
    const rows = standings.groups?.[g]
    const pts: Record<string, number> = {}
    let order: string[]
    if (rows && rows.length) {
      const sorted = [...rows].sort((a, b) => a.rank - b.rank)
      order = sorted.map((r) => r.code)
      for (const r of sorted) pts[r.code] = r.pts
    } else {
      // no standings yet: order by the model's rating so there is still a sensible default
      order = [...groups[g]].sort((a, b) => ratingOf(b) - ratingOf(a))
      for (const c of order) pts[c] = 0
    }
    const pl: Record<string, number> = {}
    for (const c of order) pl[c] = played[c] ?? 0
    views.push({
      group: g,
      order,
      pts,
      played: pl,
      defaultTop2: [order[0], order[1]],
      complete: !!standings.complete?.[g],
    })
  }
  return views
}

/**
 * Each group's full predicted finishing order [1st, 2nd, 3rd, 4th]. Complete
 * groups are locked to reality; otherwise the user's two qualifiers (in the
 * order they chose) lead, and the remaining teams follow in standings order.
 */
export function effectiveGroupOrder(
  views: GroupView[],
  selections: GroupSelections,
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const v of views) {
    if (v.complete) {
      out[v.group] = v.order
      continue
    }
    // only trust a stored selection if both codes are still in this group —
    // a refresh or stale storage can leave a phantom code that would otherwise
    // corrupt the order (wrong length / non-member) and desync the bracket
    const sel = selections[v.group]
    const valid = sel?.length === 2 && sel.every((c) => v.order.includes(c))
    const q = valid ? sel : v.defaultTop2
    const rest = v.order.filter((c) => !q.includes(c))
    out[v.group] = [q[0], q[1], ...rest]
  }
  return out
}

/**
 * Build the knockout bracket (Round of 32 → final) from the predicted group
 * orders, plus the set of knockout ties already decided by real results.
 */
export function buildKnockout(
  order: Record<string, string[]>,
  matches: Match[],
  venues: Record<string, Venue>,
  model: SimModel,
): { bracket: PredBracket; lockedKo: Record<number, string> } {
  const ratingOf = (c: string) => model.teams[c]?.r ?? 1500
  const vCountry = (m: Match) => (m.venueId ? venues[m.venueId]?.country : undefined)

  // best eight third-placed teams (by model rating — there are no scores to rank on)
  const thirds = Object.entries(order)
    .map(([g, o]) => ({ g, code: o[2] }))
    .filter((t): t is { g: string; code: string } => !!t.code)
  thirds.sort((a, b) => ratingOf(b.code) - ratingOf(a.code) || a.g.localeCompare(b.g))
  const qualifiedThirds = thirds.slice(0, 8).map((t) => t.g)

  const ko = matches.filter((m) => m.stage !== 'group').sort((a, b) => a.n - b.n)
  const posOf = (g: string, idx: number) => order[g]?.[idx]
  const thirdSlots = ko
    .flatMap((m) => [m.phA, m.phB])
    .filter((ph): ph is string => !!ph && /^3[A-L]{2,}$/.test(ph))
  const assignment = assignThirds(
    thirdSlots.map((ph) => ph.slice(1).split('')),
    qualifiedThirds,
  )
  const thirdBySlot = new Map<string, string>()
  thirdSlots.forEach((ph, i) => {
    const g = assignment[i]
    if (g) thirdBySlot.set(ph, g)
  })

  const resolveSlot = (ph: string | null): string | undefined => {
    if (!ph) return undefined
    const grp = /^([1-4])([A-L])$/.exec(ph)
    if (grp) return posOf(grp[2], Number(grp[1]) - 1)
    if (/^3[A-L]{2,}$/.test(ph)) {
      const g = thirdBySlot.get(ph)
      return g ? posOf(g, 2) : undefined
    }
    return undefined
  }
  const sideCode = (m: Match, which: 'home' | 'away'): string | undefined => {
    const side = m[which]
    if (side) return side.code
    return resolveSlot(which === 'home' ? m.phA : m.phB)
  }
  const feeder = (ph: string | null): number | undefined => {
    const mm = ph ? /^W(\d+)$/.exec(ph) : null
    return mm ? Number(mm[1]) : undefined
  }
  const realWinner = (m: Match): string | undefined => {
    if (m.status !== 'finished' || !m.home || !m.away) return undefined
    if (m.winner) return m.winner
    const hp = m.home.pen ?? 0
    const ap = m.away.pen ?? 0
    if (hp !== ap) return hp > ap ? m.home.code : m.away.code
    return (m.home.score ?? 0) >= (m.away.score ?? 0) ? m.home.code : m.away.code
  }

  const lockedKo: Record<number, string> = {}
  for (const m of ko) {
    const w = realWinner(m)
    if (w) lockedKo[m.n] = w
  }

  const buildRound = (stage: Stage): PredMatch[] =>
    ko
      .filter((m) => m.stage === stage)
      .sort((a, b) => a.n - b.n)
      .map((m) => {
        const pm: PredMatch = { n: m.n, stage, venueCountry: vCountry(m) }
        if (stage === 'r32') {
          pm.seedHome = sideCode(m, 'home')
          pm.seedAway = sideCode(m, 'away')
        } else {
          pm.feedHome = feeder(m.phA)
          pm.feedAway = feeder(m.phB)
        }
        return pm
      })

  const fin = buildRound('final')
  return {
    bracket: {
      rounds: [buildRound('r32'), buildRound('r16'), buildRound('qf'), buildRound('sf'), fin],
      finalN: fin[0]?.n ?? 104,
    },
    lockedKo,
  }
}

/** advance the model's favourite in every ready tie — a complete sample bracket */
export function advanceModel(
  bracket: PredBracket,
  model: SimModel,
): { winner: Record<number, string>; parts: Record<number, { home?: string; away?: string }> } {
  const winner: Record<number, string> = {}
  const parts: Record<number, { home?: string; away?: string }> = {}
  for (const round of bracket.rounds) {
    for (const pm of round) {
      const home = pm.seedHome ?? (pm.feedHome != null ? winner[pm.feedHome] : undefined)
      const away = pm.seedAway ?? (pm.feedAway != null ? winner[pm.feedAway] : undefined)
      parts[pm.n] = { home, away }
      if (home && away) {
        winner[pm.n] = koWinProb(model, home, away, pm.venueCountry) >= 0.5 ? home : away
      }
    }
  }
  return { winner, parts }
}

/**
 * The bracket as a funnel for the results card: every team grouped by the round
 * its run ended in (the loser of each tie), latest exit first. Champion + these
 * rows together account for all 32 teams, so it shows the whole bracket.
 */
export function bracketFunnel(
  bracket: PredBracket,
  parts: Record<number, { home?: string; away?: string }>,
  winner: Record<number, string>,
): { key: string; teams: string[] }[] {
  const byStage: Record<string, string[]> = {}
  for (const round of bracket.rounds) {
    for (const pm of round) {
      const { home, away } = parts[pm.n] ?? {}
      const w = winner[pm.n]
      if (!home || !away || !w) continue
      const loser = w === home ? away : home
      byStage[pm.stage] ??= []
      byStage[pm.stage].push(loser)
    }
  }
  return [
    { key: 'predictRunnerUp', teams: byStage.final ?? [] },
    { key: 'stageSf', teams: byStage.sf ?? [] },
    { key: 'stageQf', teams: byStage.qf ?? [] },
    { key: 'stageR16', teams: byStage.r16 ?? [] },
    { key: 'stageR32', teams: byStage.r32 ?? [] },
  ]
}
