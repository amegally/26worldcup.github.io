import { useMemo } from 'react'
import { useI18n } from '../i18n'
import type { Team } from '../types'
import type { PredBracket, PredMatch } from '../utils/predictBracket'
import Flag from './Flag'
import LeadLine from './LeadLine'
import './brackettreecard.css'

interface BracketTreeCardProps {
  teams: Record<string, Team>
  bracket: PredBracket
  /** resolved two sides per match number (from the Predict walk / advanceModel) */
  parts: Record<number, { home?: string; away?: string }>
  /** winner code per match number */
  winner: Record<number, string>
  champion: string
  appName: string
  appSub: string
  /** small all-caps line under the masthead */
  tagline: string
  /** label over the champion (e.g. "Your champion" / "Projected champion") */
  championLabel: string
  /** "made on" stamp shown under the tagline (the user's own card only) */
  date?: string
  /** set for the user's own card so it can be screenshotted by id */
  id?: string
  /** optional corner badge (e.g. "Sample") */
  badge?: string
  /** show the lead-capture line in the footer (the user's own card only) */
  lead?: boolean
}

interface NodeCtx {
  byN: Record<number, PredMatch>
  parts: Record<number, { home?: string; away?: string }>
  winner: Record<number, string>
  teams: Record<string, Team>
  name: (code: string) => string
}

/** one matchup: two stacked flags, the advancing side ringed and the other faded,
 *  with its two feeding sub-trees nested toward the bracket's outer edge. The
 *  left/right mirror is driven entirely by the `.brc-left` / `.brc-right` parent. */
function FlagNode({ n, ctx }: { n: number; ctx: NodeCtx }) {
  const pm = ctx.byN[n]
  if (!pm) return null
  const leaf = pm.stage === 'r32'
  const w = ctx.winner[n]
  const { home, away } = ctx.parts[n] ?? {}
  const tie = (
    <div className="brc-tie">
      {[home, away].map((code, i) => (
        <span
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          className={`brc-slot${code ? (code === w ? ' win' : ' lose') : ' tbd'}`}
        >
          {code ? <Flag team={ctx.teams[code]} size={30} title={ctx.name(code)} /> : null}
        </span>
      ))}
    </div>
  )
  if (leaf) return <div className="brc-node is-leaf">{tie}</div>
  return (
    <div className="brc-node">
      {tie}
      <div className="brc-children">
        {pm.feedHome != null && <FlagNode n={pm.feedHome} ctx={ctx} />}
        {pm.feedAway != null && <FlagNode n={pm.feedAway} ctx={ctx} />}
      </div>
    </div>
  )
}

/** The shareable bracket graphic: the whole field as a two-sided flag tree that
 *  flows inward to the crowned champion. A flags-only alternative to BracketCard;
 *  same chrome, same screenshot/share pipeline. */
export default function BracketTreeCard({
  teams,
  bracket,
  parts,
  winner,
  champion,
  appName,
  appSub,
  tagline,
  championLabel,
  date,
  id,
  badge,
  lead,
}: BracketTreeCardProps) {
  const { t, pick } = useI18n()
  const name = (code: string) => pick(teams[code]?.name, code)

  const byN = useMemo(() => {
    const m: Record<number, PredMatch> = {}
    for (const round of bracket.rounds) for (const pm of round) m[pm.n] = pm
    return m
  }, [bracket])

  const final = byN[bracket.finalN]
  const leftRootN = final?.feedHome
  const rightRootN = final?.feedAway
  const fin = parts[bracket.finalN] ?? {}
  const runnerUp = fin.home === champion ? fin.away : fin.home

  const ctx: NodeCtx = { byN, parts, winner, teams, name }

  return (
    <div className="brc" id={id}>
      {badge && <span className="brc-badge">{badge}</span>}
      <div className="brc-masthead">
        <span className="brc-word">{appName}</span>
        <span className="brc-sub">{appSub}</span>
      </div>
      <div className="brc-tagline kicker">{tagline}</div>
      {date && <div className="brc-date">{date}</div>}

      <div className="brc-bracket">
        <div className="brc-half brc-left">{leftRootN != null && <FlagNode n={leftRootN} ctx={ctx} />}</div>

        <div className="brc-champ">
          <span className="brc-champ-kick kicker">{championLabel}</span>
          <Flag team={teams[champion]} size={58} title={name(champion)} />
          <span className="brc-champ-name">{name(champion)}</span>
          {runnerUp && <span className="brc-champ-ru">{t('predictDefeated', { team: name(runnerUp) })}</span>}
        </div>

        <div className="brc-half brc-right">
          {rightRootN != null && <FlagNode n={rightRootN} ctx={ctx} />}
        </div>
      </div>

      <div className="brc-foot">
        {appName} · {appSub}
      </div>
      {lead && <LeadLine className="brc-lead" />}
    </div>
  )
}
