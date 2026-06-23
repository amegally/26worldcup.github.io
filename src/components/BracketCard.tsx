import { useI18n } from '../i18n'
import type { Team } from '../types'
import Flag from './Flag'
import LeadLine from './LeadLine'
import './bracketcard.css'

interface BracketCardProps {
  teams: Record<string, Team>
  champion: string
  /** rows of eliminated teams by round (from bracketFunnel) */
  funnel: { key: string; teams: string[] }[]
  appName: string
  appSub: string
  /** small all-caps line under the masthead (e.g. "My Cup 2026 bracket") */
  tagline: string
  /** label above the champion (e.g. "Your champion" / "Projected champion") */
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

/** The shareable broadsheet bracket card: champion enthroned, then the whole
 *  field grouped by how far it advanced. Used for the user's result and for the
 *  homepage sample. */
export default function BracketCard({
  teams,
  champion,
  funnel,
  appName,
  appSub,
  tagline,
  championLabel,
  date,
  id,
  badge,
  lead,
}: BracketCardProps) {
  const { t, pick } = useI18n()
  const name = (code: string) => pick(teams[code]?.name, code)
  return (
    <div className="pr-card" id={id}>
      {badge && <span className="pr-card-badge">{badge}</span>}
      <div className="pr-card-masthead">
        <span className="pr-card-word">{appName}</span>
        <span className="pr-card-sub">{appSub}</span>
      </div>
      <div className="pr-card-tagline kicker">{tagline}</div>
      {date && <div className="pr-card-date">{date}</div>}

      <div className="pr-card-champ">
        <Flag team={teams[champion]} size={52} />
        <div>
          <div className="pr-card-champ-label kicker">{championLabel}</div>
          <div className="pr-card-champ-name">{name(champion)}</div>
        </div>
      </div>

      <hr className="rule pr-card-rule" />

      <div className="pr-card-rounds">
        {funnel.map((row) =>
          row.teams.length ? (
            <div className="pr-card-row" key={row.key}>
              <div className="pr-card-row-label kicker">{t(row.key)}</div>
              <div className="pr-card-row-teams">
                {[...row.teams]
                  .sort((a, b) => name(a).localeCompare(name(b)))
                  .map((code) => (
                    <span className="pr-card-chip" key={code} title={name(code)}>
                      <Flag team={teams[code]} size={15} />
                      <span className="pr-card-chip-code tnum">{code}</span>
                    </span>
                  ))}
              </div>
            </div>
          ) : null,
        )}
      </div>

      <div className="pr-card-foot">
        {appName} · {appSub}
      </div>
      {lead && <LeadLine className="pr-card-lead" />}
    </div>
  )
}
