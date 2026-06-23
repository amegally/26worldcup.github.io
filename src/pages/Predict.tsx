import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useI18n } from '../i18n'
import { useAppData, useData } from '../data/DataContext'
import { STAGE_LABEL_KEY } from '../utils/helpers'
import {
  buildKnockout,
  effectiveGroupOrder,
  type GroupSelections,
  type GroupView,
  groupViews,
  koWinProb,
  type PredMatch,
} from '../utils/predictBracket'
import type { SimModel } from '../sim/engine'
import type { Team } from '../types'
import Flag from '../components/Flag'
import Trophy from '../components/Trophy'
import Icon from '../components/Icon'
import './predict.css'

const PICKS_KEY = 'pickpick-predict-v1'
const GROUPS_KEY = 'pickpick-groups-v1'
const EMAIL_KEY = 'pickpick-email-v1'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Picks = Record<number, string>

function loadPicks(): Picks {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PICKS_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Picks = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && /^\d+$/.test(k)) out[Number(k)] = v
    }
    return out
  } catch {
    return {}
  }
}

function loadGroups(): GroupSelections {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(GROUPS_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    const out: GroupSelections = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[k] = v as string[]
    }
    return out
  } catch {
    return {}
  }
}

function loadEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY)
  } catch {
    return null
  }
}

export default function Predict() {
  const { t } = useI18n()
  const { matches, teams, venues, standings } = useAppData()
  const { simModel, loadSimModel } = useData()
  useEffect(() => {
    loadSimModel()
  }, [loadSimModel])

  const [picks, setPicks] = useState<Picks>(loadPicks)
  const [groupSel, setGroupSel] = useState<GroupSelections>(loadGroups)
  const [email, setEmail] = useState<string | null>(loadEmail)
  const [emailInput, setEmailInput] = useState('')
  const [emailError, setEmailError] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem(PICKS_KEY, JSON.stringify(picks))
    } catch {
      /* private mode */
    }
  }, [picks])
  useEffect(() => {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(groupSel))
    } catch {
      /* private mode */
    }
  }, [groupSel])

  // groups → predicted finishing orders → knockout seeds, all anchored to today
  const views = useMemo(
    () => (simModel ? groupViews(matches, teams, standings, simModel) : []),
    [matches, teams, standings, simModel],
  )
  const order = useMemo(() => effectiveGroupOrder(views, groupSel), [views, groupSel])
  const { bracket, lockedKo } = useMemo(
    () => (simModel ? buildKnockout(order, matches, venues, simModel) : { bracket: null, lockedKo: {} }),
    [order, matches, venues, simModel],
  )

  // walk the knockout in play order: each tie's two sides are the Round-of-32
  // seeds or the winners the user advanced. A real, finished tie locks its
  // winner; otherwise a stored pick counts only while it is still one of the
  // tie's current participants, so changing anything upstream cascades cleanly.
  const { winner, parts, total, done } = useMemo(() => {
    const winner: Record<number, string> = {}
    const parts: Record<number, { home?: string; away?: string }> = {}
    let total = 0
    let done = 0
    if (!bracket) return { winner, parts, total, done }
    for (const round of bracket.rounds) {
      for (const pm of round) {
        total++
        const home = pm.seedHome ?? (pm.feedHome != null ? winner[pm.feedHome] : undefined)
        const away = pm.seedAway ?? (pm.feedAway != null ? winner[pm.feedAway] : undefined)
        parts[pm.n] = { home, away }
        const locked = lockedKo[pm.n]
        const choice = locked ?? picks[pm.n]
        if (choice && (choice === home || choice === away)) {
          winner[pm.n] = choice
          done++
        }
      }
    }
    return { winner, parts, total, done }
  }, [bracket, picks, lockedKo])

  const complete = total > 0 && done === total
  const champion = bracket ? winner[bracket.finalN] : undefined

  // the full bracket as a funnel for the results card: every team grouped by the
  // round its run ended in (the loser of each tie), latest exit first. Champion +
  // these rows together account for all 32 teams, so it shows the whole bracket.
  const funnel = useMemo<{ key: string; teams: string[] }[]>(() => {
    if (!bracket) return []
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
  }, [bracket, parts, winner])

  if (!simModel || !bracket) {
    return (
      <div className="pr-page">
        <div className="page-head">
          <h1>{t('predictTitle')}</h1>
          <p>{t('predictSub')}</p>
        </div>
        <p className="muted">{t('predictNeedModel')}</p>
      </div>
    )
  }

  const setPick = (n: number, code: string) => {
    if (lockedKo[n]) return // a finished tie cannot be changed
    setPicks((p) => ({ ...p, [n]: code }))
  }

  // tap a team in a group to predict its finish: an unranked team becomes the
  // runner-up; tapping the current runner-up promotes it to group winner.
  const toggleGroup = (g: string, code: string) => {
    const view = views.find((v) => v.group === g)
    if (!view || view.complete) return
    setGroupSel((prev) => {
      const cur = prev[g]?.length === 2 ? prev[g] : [...view.defaultTop2]
      let next: string[]
      if (cur[0] === code) next = cur
      else if (cur[1] === code) next = [code, cur[0]]
      else next = [cur[0], code]
      return { ...prev, [g]: next }
    })
  }

  const resetToToday = () => {
    if (window.confirm(t('predictResetConfirm'))) {
      setGroupSel({})
      setPicks({})
    }
  }

  const onReveal = (e: FormEvent) => {
    e.preventDefault()
    const v = emailInput.trim()
    if (!EMAIL_RE.test(v)) {
      setEmailError(t('predictEmailInvalid'))
      return
    }
    // ─── EMAIL PROVIDER PLACEHOLDER ──────────────────────────────────────────
    // There is no backend yet: the captured email is stored in localStorage only.
    // TODO(email-provider): send { email: v, groupSel, picks, champion } to a real
    // email service / backend here (e.g. Loops, Mailchimp, or a serverless endpoint).
    // ─────────────────────────────────────────────────────────────────────────
    try {
      localStorage.setItem(EMAIL_KEY, v)
    } catch {
      /* private mode — keep going, the reveal still works for this session */
    }
    setEmail(v)
    setEmailError('')
  }

  const revealed = !!email
  const showCard = revealed && complete && !!champion

  return (
    <div className="pr-page">
      <div className="page-head">
        <h1>{t('predictTitle')}</h1>
        <p>{t('predictSub')}</p>
      </div>

      <div className="pr-sync">
        <span className="kicker">{t('predictLiveNote')}</span>
        <button type="button" className="btn pr-reset" onClick={resetToToday}>
          <Icon name="clock" size={15} />
          {t('predictReset')}
        </button>
      </div>

      {complete && !revealed && (
        <section className="card card-pad pr-gate">
          <div className="pr-gate-head">
            <Icon name="target" size={18} />
            <h2>{t('predictRevealTitle')}</h2>
          </div>
          <p className="muted">{t('predictEmailHint')}</p>
          <form className="pr-gate-form" onSubmit={onReveal} noValidate>
            <label className="sr-only" htmlFor="pr-email">
              {t('predictEmailLabel')}
            </label>
            <input
              id="pr-email"
              className="input pr-email"
              type="email"
              autoComplete="email"
              placeholder={t('predictEmailPlaceholder')}
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value)
                if (emailError) setEmailError('')
              }}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'pr-email-err' : undefined}
            />
            <button type="submit" className="btn btn-primary">
              {t('predictReveal')}
            </button>
          </form>
          {emailError && (
            <p id="pr-email-err" className="pr-email-err">
              {emailError}
            </p>
          )}
        </section>
      )}

      {showCard && champion && (
        <>
          <ResultsCard
            teams={teams}
            champion={champion}
            funnel={funnel}
            appName={t('appName')}
            appSub={t('appSub')}
          />
          <p className="muted small pr-share-hint">{t('predictShareHint')}</p>
        </>
      )}

      {/* ---- group stage ---- */}
      <div className="section-title">
        <h2 className="section-title-h">{t('predictGroupsTitle')}</h2>
      </div>
      <p className="muted small pr-legend">{t('predictGroupsHint')}</p>
      <div className="pr-groups">
        {views.map((v) => (
          <GroupCard
            key={v.group}
            view={v}
            order={order[v.group] ?? v.order}
            teams={teams}
            onToggle={toggleGroup}
          />
        ))}
      </div>

      {/* ---- knockout ---- */}
      <div className="section-title pr-ko-head">
        <h2 className="section-title-h">{t('predictKnockoutTitle')}</h2>
        <span className="kicker tnum pr-ko-progress">{t('predictProgress', { done, total })}</span>
      </div>
      <p className="muted small pr-legend">{t('predictPickHint')}</p>
      <div className="pr-bracket">
        {bracket.rounds.map((round) => (
          <div className="pr-round" key={round[0]?.stage}>
            <div className="pr-round-head kicker">{t(STAGE_LABEL_KEY[round[0].stage])}</div>
            <div className="pr-round-ties">
              {round.map((pm) => (
                <TieCard
                  key={pm.n}
                  model={simModel}
                  teams={teams}
                  pm={pm}
                  home={parts[pm.n]?.home}
                  away={parts[pm.n]?.away}
                  picked={winner[pm.n]}
                  locked={!!lockedKo[pm.n]}
                  onPick={setPick}
                  champ={pm.n === bracket.finalN}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GroupCard({
  view,
  order,
  teams,
  onToggle,
}: {
  view: GroupView
  order: string[]
  teams: Record<string, Team>
  onToggle: (g: string, code: string) => void
}) {
  const { t, pick } = useI18n()
  return (
    <div className={`pr-group${view.complete ? ' done' : ''}`}>
      <div className="pr-group-head">
        <span className="pr-group-name">{t('groupX', { x: view.group })}</span>
        {view.complete && <span className="pr-group-final">{t('predictDecided')}</span>}
      </div>
      <ol className="pr-group-rows">
        {order.map((code, i) => {
          const cls = i < 2 ? 'q' : i === 2 ? 'third' : 'out'
          return (
            <li key={code}>
              <button
                type="button"
                className={`pr-group-row ${cls}`}
                disabled={view.complete}
                onClick={() => onToggle(view.group, code)}
                title={view.complete ? undefined : t('predictThroughHint')}
              >
                <span className="pr-group-pos tnum">{i + 1}</span>
                <Flag team={teams[code]} size={16} />
                <span className="pr-group-nm">{pick(teams[code]?.name, code)}</span>
                {i < 2 && <span className="pr-group-tag">{t('predictThrough')}</span>}
                <span className="pr-group-pts tnum">{view.pts[code] ?? 0}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function TieCard({
  model,
  teams,
  pm,
  home,
  away,
  picked,
  locked,
  onPick,
  champ,
}: {
  model: SimModel
  teams: Record<string, Team>
  pm: PredMatch
  home?: string
  away?: string
  picked?: string
  locked: boolean
  onPick: (n: number, code: string) => void
  champ: boolean
}) {
  const { t, pick } = useI18n()
  const ready = !!home && !!away
  const pHome = ready ? koWinProb(model, home as string, away as string, pm.venueCountry) : null
  const favCode = pHome == null ? null : pHome >= 0.5 ? home : away

  return (
    <div
      className={`pr-tie${picked ? ' has-pick' : ''}${champ ? ' pr-tie-final' : ''}${locked ? ' locked' : ''}`}
    >
      <div className="pr-tie-top">
        {champ && <Trophy size={13} />}
        <span className="pr-tie-n tnum">{champ ? t('predictYourChampion') : `#${pm.n}`}</span>
        {locked && <span className="pr-tie-lock">{t('predictDecided')}</span>}
      </div>
      {ready ? (
        [home as string, away as string].map((code) => {
          const sel = picked === code
          const prob = code === home ? (pHome as number) : 1 - (pHome as number)
          return (
            <button
              type="button"
              key={code}
              className={`pr-opt${sel ? ' sel' : ''}`}
              aria-pressed={sel}
              disabled={locked}
              onClick={() => onPick(pm.n, code)}
            >
              <Flag team={teams[code]} size={18} />
              <span className="pr-opt-nm">{pick(teams[code]?.name, code)}</span>
              {!locked && favCode === code && <span className="pr-fav">{t('predictModelFav')}</span>}
              <span className="pr-opt-pct tnum">{Math.round(prob * 100)}%</span>
            </button>
          )
        })
      ) : (
        <div className="pr-tie-tbd">{t('predictTbd')}</div>
      )}
    </div>
  )
}

function ResultsCard({
  teams,
  champion,
  funnel,
  appName,
  appSub,
}: {
  teams: Record<string, Team>
  champion: string
  funnel: { key: string; teams: string[] }[]
  appName: string
  appSub: string
}) {
  const { t, pick } = useI18n()
  const name = (code: string) => pick(teams[code]?.name, code)
  return (
    <div className="pr-card" id="predict-card">
      <div className="pr-card-masthead">
        <span className="pr-card-word">{appName}</span>
        <span className="pr-card-sub">{appSub}</span>
      </div>
      <div className="pr-card-tagline kicker">{t('predictCardTagline')}</div>

      <div className="pr-card-champ">
        <Flag team={teams[champion]} size={52} />
        <div>
          <div className="pr-card-champ-label kicker">
            <Trophy size={15} /> {t('predictYourChampion')}
          </div>
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
    </div>
  )
}
